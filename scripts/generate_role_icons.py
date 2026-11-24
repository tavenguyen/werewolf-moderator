#!/usr/bin/env python3
"""
scripts/generate_role_icons.py

Batch generation of Werewolf role icons in WebP format using Cloudflare Workers AI
(Supports @cf/black-forest-labs/flux-1-schnell, Stable Diffusion XL, and SDXL-Lightning).
"""

import os
import sys
import json
import time
import io
import base64
import argparse
from pathlib import Path
from PIL import Image
import numpy as np
import requests

# Default models
DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell"

# SDXL negative prompt to ensure clean vector/emblem output
NEGATIVE_PROMPT = (
    "text, letters, words, numbers, signature, watermark, username, playing card border, "
    "ornate border, decorative frame, card frame, realistic photo, photorealistic, 3d render, "
    "blurry, low quality, white background, cluttered, messy fabric, textured background"
)


def load_env_file():
    """Load CF_ACCOUNT_ID and CF_API_TOKEN from .env or .env.local if present."""
    for env_name in [".env", ".env.local"]:
        p = Path(env_name)
        if p.is_file():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip("'\"")
                            if k not in os.environ:
                                os.environ[k] = v
            except Exception:
                pass


def post_process_and_save(img: Image.Image, output_path: Path):
    """
    Post-process generated image with NumPy & Pillow:
    1. Force any pixel with (R < 22 and G < 26 and B < 35) to exact #0B0E14 (11, 14, 20).
    2. Resize to 512x512 using LANCZOS.
    3. Save as WEBP with quality=82, method=6 (< 40KB).
    """
    arr = np.array(img.convert("RGB"))
    # Black background normalization to #0B0E14
    mask = (arr[:, :, 0] < 22) & (arr[:, :, 1] < 26) & (arr[:, :, 2] < 35)
    arr[mask] = [11, 14, 20]

    clean_img = Image.fromarray(arr)
    resized_img = clean_img.resize((512, 512), Image.Resampling.LANCZOS)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    resized_img.save(output_path, "WEBP", quality=82, method=6)


def call_cloudflare_workers_ai(
    account_id: str,
    api_token: str,
    model: str,
    prompt: str,
    max_retries: int = 5,
    base_backoff: float = 4.0,
) -> Image.Image:
    """Call Cloudflare Workers AI REST API and return a PIL Image."""
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }

    # Prepare payload based on model architecture
    if "flux" in model.lower():
        payload = {
            "prompt": prompt,
            "num_steps": 4,  # Optimal for FLUX.1-schnell (1-8 steps)
        }
    else:
        # SDXL / Lightning models
        payload = {
            "prompt": prompt,
            "negative_prompt": NEGATIVE_PROMPT,
            "num_steps": 20 if "lightning" not in model.lower() else 8,
            "guidance": 7.5,
            "width": 1024,
            "height": 1024,
        }

    for attempt in range(max_retries):
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=60)

            # Check rate limit or server error
            if resp.status_code == 429 or resp.status_code >= 500:
                wait_time = base_backoff * (2**attempt)
                print(f"  ⚠ Cloudflare HTTP {resp.status_code}. Retrying in {wait_time:.1f}s (attempt {attempt + 1}/{max_retries})...")
                time.sleep(wait_time)
                continue

            if resp.status_code != 200:
                raise RuntimeError(f"Cloudflare API Error ({resp.status_code}): {resp.text}")

            content_type = resp.headers.get("content-type", "").lower()

            # Handle direct binary image response (standard for Workers AI image models)
            if "image" in content_type:
                return Image.open(io.BytesIO(resp.content))

            # Handle JSON response with base64 image
            if "json" in content_type:
                data = resp.json()
                if not data.get("success", False) and "errors" in data:
                    raise RuntimeError(f"Cloudflare returned errors: {data['errors']}")
                if "result" in data and "image" in data["result"]:
                    b64_data = data["result"]["image"]
                    return Image.open(io.BytesIO(base64.b64decode(b64_data)))

            # Fallback: attempt direct bytes decode
            try:
                return Image.open(io.BytesIO(resp.content))
            except Exception:
                raise RuntimeError(f"Could not parse image from response: {resp.text[:300]}")

        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                wait_time = base_backoff * (2**attempt)
                print(f"  ⚠ Network error: {e}. Retrying in {wait_time:.1f}s...")
                time.sleep(wait_time)
            else:
                raise e

    raise RuntimeError("Max retries exceeded when calling Cloudflare Workers AI")


def generate_single_icon(
    account_id: str,
    api_token: str,
    model_name: str,
    item: dict,
    output_path: Path,
):
    """Generate and save a single role icon."""
    role_id = item["id"]
    faction = item.get("faction", "VILLAGER")
    prompt_text = item["prompt"]

    print(f"[{role_id}] Requesting generation ({faction}, model: {model_name})...")
    img = call_cloudflare_workers_ai(account_id, api_token, model_name, prompt_text)
    post_process_and_save(img, output_path)
    size_kb = output_path.stat().st_size / 1024
    print(f"[{role_id}] ✓ Successfully generated and saved to {output_path} ({size_kb:.1f} KB)")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Batch generate Werewolf role icons in WebP format using Cloudflare Workers AI."
    )
    parser.add_argument("--test", action="store_true", help="Only run 3 representative roles (1 Werewolf, 1 Villager, 1 Third Party)")
    parser.add_argument("--force", action="store_true", help="Overwrite existing icons")
    parser.add_argument("--id", type=str, default=None, help="Generate for a specific role ID only")
    parser.add_argument("--model", type=str, default=None, help=f"Cloudflare AI model (default: {DEFAULT_MODEL})")
    parser.add_argument("--cf-token", type=str, default=None, help="Cloudflare API Token (overrides CF_API_TOKEN env)")
    parser.add_argument("--cf-account-id", type=str, default=None, help="Cloudflare Account ID (overrides CF_ACCOUNT_ID env)")
    parser.add_argument("--prompts", type=str, default="scripts/roles_prompts.json", help="Path to prompts JSON file")
    parser.add_argument("--output-dir", type=str, default="public/images/roles", help="Output directory")
    args = parser.parse_args()

    load_env_file()

    api_token = (
        args.cf_token
        or os.environ.get("CF_API_TOKEN")
        or os.environ.get("CLOUDFLARE_API_TOKEN")
    )
    account_id = (
        args.cf_account_id
        or os.environ.get("CF_ACCOUNT_ID")
        or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    )

    if not api_token or not account_id:
        print("Error: Cloudflare credentials missing!", file=sys.stderr)
        print("Please provide CF_ACCOUNT_ID and CF_API_TOKEN in your .env file or via flags:", file=sys.stderr)
        print("  --cf-account-id <ACCOUNT_ID>", file=sys.stderr)
        print("  --cf-token <API_TOKEN>", file=sys.stderr)
        print("\nGet your free credentials at https://dash.cloudflare.com/:", file=sys.stderr)
        print("1. Account ID: Visible in the Cloudflare dashboard under 'Workers & Pages' on the right sidebar.")
        print("2. API Token: Go to My Profile -> API Tokens -> Create Token -> Use template 'Workers AI' (or custom with Workers AI Read/Edit).", file=sys.stderr)
        sys.exit(1)

    model_name = args.model or os.environ.get("CF_MODEL") or DEFAULT_MODEL

    prompts_path = Path(args.prompts)
    if not prompts_path.is_file():
        print(f"Error: Prompts file not found: {prompts_path}", file=sys.stderr)
        sys.exit(1)

    with open(prompts_path, "r", encoding="utf-8") as f:
        all_roles = json.load(f)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Filter roles to run
    if args.id:
        targets = [r for r in all_roles if r["id"] == args.id]
        if not targets:
            print(f"Error: Role with ID '{args.id}' not found in {prompts_path}", file=sys.stderr)
            sys.exit(1)
    elif args.test:
        wolf_pick = next((r for r in all_roles if r["faction"] == "WEREWOLF" and (args.force or not (output_dir / f"{r['id']}.webp").exists())), None)
        villager_pick = next((r for r in all_roles if r["faction"] == "VILLAGER" and (args.force or not (output_dir / f"{r['id']}.webp").exists())), None)
        third_pick = next((r for r in all_roles if r["faction"] == "THIRD_PARTY" and (args.force or not (output_dir / f"{r['id']}.webp").exists())), None)
        if not wolf_pick:
            wolf_pick = next((r for r in all_roles if r["faction"] == "WEREWOLF"), None)
        if not villager_pick:
            villager_pick = next((r for r in all_roles if r["faction"] == "VILLAGER"), None)
        if not third_pick:
            third_pick = next((r for r in all_roles if r["faction"] == "THIRD_PARTY"), None)
        targets = [r for r in [wolf_pick, villager_pick, third_pick] if r is not None]
        print(f"Test mode: Running 3 representative roles -> {[r['id'] for r in targets]}")
    else:
        targets = all_roles

    print(f"Starting icon generation for {len(targets)} roles via Cloudflare Workers AI ({model_name})...")

    total = len(targets)
    success_count = 0
    skipped_count = 0

    for idx, item in enumerate(targets, 1):
        role_id = item["id"]
        out_file = output_dir / f"{role_id}.webp"

        if out_file.exists() and not args.force:
            print(f"[{idx}/{total}] Skipping '{role_id}': {out_file} already exists.")
            skipped_count += 1
            continue

        try:
            print(f"[{idx}/{total}] Processing '{role_id}' ({item.get('faction')})...")
            success = generate_single_icon(account_id, api_token, model_name, item, out_file)
            if success:
                success_count += 1
        except Exception as e:
            print(f"Failed to generate for '{role_id}': {e}", file=sys.stderr)

        # Gentle pause between requests
        if idx < total:
            time.sleep(2)

    print("\n--- Summary ---")
    print(f"Total processed: {total}")
    print(f"Successfully generated: {success_count}")
    print(f"Skipped (already exists): {skipped_count}")


if __name__ == "__main__":
    main()
