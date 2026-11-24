#!/usr/bin/env python3
"""
scripts/generate_role_icons.py

Batch generation of Werewolf role icons in WebP format using Google GenAI SDK.
"""

import os
import sys
import json
import time
import io
import argparse
from pathlib import Path
from PIL import Image
import numpy as np

try:
    from google import genai
    from google.genai import types
    from google.genai.errors import APIError
except ImportError:
    print("Error: 'google-genai' is not installed. Please run: pip install google-genai", file=sys.stderr)
    sys.exit(1)

# Default style reference images
DEFAULT_REF_MAP = {
    "WEREWOLF": Path("scripts/refs/ref_werewolf.png"),
    "VILLAGER": Path("scripts/refs/ref_villager.png"),
    "THIRD_PARTY": Path("scripts/refs/ref_third.png"),
}

STYLE_LOCK_PROMPT = (
    "Style Reference Requirement: Closely lock and match the exact art style, stroke line width, "
    "angular geometric planar facets, and crisp gold foil rim lighting of the reference image. "
    "Background must be solid flat obsidian black (#0B0E14). Maintain warm amber gold (#F59E0B) line-art "
    "with the specified pinpoint faction accent color. Square 1:1 framing, centered symmetrical "
    "upper-body bust portrait, flat 2D graphic design tarot emblem with zero clutter, no text, "
    "no numbers, and no card borders or frames."
)


def load_env_file():
    """Load GEMINI_API_KEY from .env or .env.local if present."""
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
    # Black background normalization
    mask = (arr[:, :, 0] < 22) & (arr[:, :, 1] < 26) & (arr[:, :, 2] < 35)
    arr[mask] = [11, 14, 20]

    clean_img = Image.fromarray(arr)
    resized_img = clean_img.resize((512, 512), Image.Resampling.LANCZOS)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    resized_img.save(output_path, "WEBP", quality=82, method=6)


def extract_image_from_response(response) -> Image.Image:
    """Extract PIL Image from google-genai response object."""
    if not hasattr(response, "candidates") or not response.candidates:
        raise ValueError("No candidates returned in response")

    for candidate in response.candidates:
        if not hasattr(candidate, "content") or not candidate.content:
            continue
        for part in candidate.content.parts:
            # Check inline_data bytes
            if getattr(part, "inline_data", None) and part.inline_data.data:
                data = part.inline_data.data
                if isinstance(data, str):
                    import base64
                    data = base64.b64decode(data)
                return Image.open(io.BytesIO(data))
            # Check direct image attribute
            if hasattr(part, "image") and part.image:
                return part.image

    raise ValueError("No image data found in response parts")


def generate_single_icon(
    client: genai.Client,
    model_name: str,
    item: dict,
    output_path: Path,
    max_retries: int = 5,
    base_backoff: float = 5.0,
):
    """Generate and save an icon with exponential backoff on 429."""
    faction = item.get("faction", "VILLAGER")
    role_id = item["id"]
    prompt_text = item["prompt"]

    ref_path = DEFAULT_REF_MAP.get(faction, DEFAULT_REF_MAP["VILLAGER"])
    if not ref_path.is_file():
        raise FileNotFoundError(f"Reference image not found at {ref_path}")

    ref_image = Image.open(ref_path).convert("RGB")
    combined_prompt = f"{STYLE_LOCK_PROMPT}\n\nTarget Role details:\n{prompt_text}"

    config = types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio="1:1"),
    )

    contents = [ref_image, combined_prompt]

    for attempt in range(max_retries):
        try:
            print(f"[{role_id}] Requesting generation ({faction}, model: {model_name})...")
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )
            img = extract_image_from_response(response)
            post_process_and_save(img, output_path)
            size_kb = output_path.stat().st_size / 1024
            print(f"[{role_id}] ✓ Successfully generated and saved to {output_path} ({size_kb:.1f} KB)")
            return True
        except Exception as e:
            err_msg = str(e).lower()
            is_rate_limit = (
                "429" in err_msg
                or "resource_exhausted" in err_msg
                or "quota" in err_msg
                or (isinstance(e, APIError) and getattr(e, "code", None) == 429)
            )
            if is_rate_limit and attempt < max_retries - 1:
                wait_time = base_backoff * (2**attempt)
                print(f"[{role_id}] ⚠ Rate limit encountered. Retrying in {wait_time:.1f}s (attempt {attempt + 1}/{max_retries})...")
                time.sleep(wait_time)
            else:
                print(f"[{role_id}] ✗ Error generating icon: {e}", file=sys.stderr)
                raise e

    return False


def main():
    parser = argparse.ArgumentParser(description="Batch generate Werewolf role icons in WebP format.")
    parser.add_argument("--test", action="store_true", help="Only run 3 representative roles (1 Werewolf, 1 Villager, 1 Third Party)")
    parser.add_argument("--force", action="store_true", help="Overwrite existing icons")
    parser.add_argument("--id", type=str, default=None, help="Generate for a specific role ID only")
    parser.add_argument("--prompts", type=str, default="scripts/roles_prompts.json", help="Path to prompts JSON file")
    parser.add_argument("--output-dir", type=str, default="public/images/roles", help="Output directory")
    parser.add_argument("--api-key", type=str, default=None, help="Gemini API key (overrides GEMINI_API_KEY env)")
    args = parser.parse_args()

    load_env_file()

    # Determine API key
    api_key = args.api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY or GOOGLE_API_KEY environment variable is not set.", file=sys.stderr)
        print("Please export GEMINI_API_KEY='your_key' or put it in .env file.", file=sys.stderr)
        sys.exit(1)

    model_name = os.environ.get("IMAGE_MODEL", "gemini-2.5-flash-image")
    client = genai.Client(api_key=api_key)

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
        # Pick 1 Werewolf, 1 Villager, 1 Third Party
        wolf_pick = next((r for r in all_roles if r["faction"] == "WEREWOLF"), None)
        villager_pick = next((r for r in all_roles if r["faction"] == "VILLAGER" and r["id"] != "villager"), None)
        third_pick = next((r for r in all_roles if r["faction"] == "THIRD_PARTY"), None)
        targets = [r for r in [wolf_pick, villager_pick, third_pick] if r is not None]
        print(f"Test mode: Running 3 representative roles -> {[r['id'] for r in targets]}")
    else:
        targets = all_roles

    print(f"Starting icon generation for {len(targets)} roles using model '{model_name}'...")

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
            success = generate_single_icon(client, model_name, item, out_file)
            if success:
                success_count += 1
        except Exception as e:
            print(f"Failed to generate for '{role_id}': {e}", file=sys.stderr)

        # Courtesy sleep between requests
        if idx < total:
            time.sleep(3)

    print("\n--- Summary ---")
    print(f"Total processed: {total}")
    print(f"Successfully generated: {success_count}")
    print(f"Skipped (already exists): {skipped_count}")


if __name__ == "__main__":
    main()
