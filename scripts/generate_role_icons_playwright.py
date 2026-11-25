#!/usr/bin/env python3
"""
scripts/generate_role_icons_playwright.py

Automates Google AI Studio via Playwright to batch generate Werewolf role icons.
Supports both:
1. Connecting to an existing Chrome browser via CDP (--cdp http://localhost:9222)
2. Launching Chrome with a persistent profile (--profile ./.chrome-profile)
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

try:
    from playwright.sync_api import sync_playwright, Page, BrowserContext
except ImportError:
    print("Error: 'playwright' is not installed. Please run: pip install playwright", file=sys.stderr)
    sys.exit(1)

# System Instructions and Style Locking
SYSTEM_INSTRUCTION = (
    "You are a Lead UI Icon Illustrator designing a cohesive character icon set for a modern dark-themed mobile web game.\n\n"
    "STRICT VISUAL RULES:\n"
    "1. Art Direction: Modern dark atmospheric emblem illustration. Bold, clean geometric silhouettes that remain instantly readable at 40x40px mobile avatar size. No cluttered details.\n"
    "2. Background: Pure, flat, uniform obsidian black (#0B0E14) background. Zero scenery, clouds, floor, or textures extending to edges.\n"
    "3. Color Hierarchy: 75% Pure Obsidian Black (#0B0E14), 20% Warm Amber Gold (#F59E0B) metallic foil line-art and rim lighting, 5% Faction Accent Color (for small glowing focal points only).\n"
    "4. Framing: Centered symmetrical upper-body bust with at least 18% empty black margin on all sides.\n"
    "5. Forbidden: NO text, NO letters, NO numbers, NO playing card borders, NO frames, NO watermarks."
)


def post_process_and_save(img: Image.Image, output_path: Path):
    """
    Post-process generated image with NumPy & Pillow:
    1. Force any pixel with (R < 22 and G < 26 and B < 35) to exact #0B0E14 (11, 14, 20).
    2. Resize to 512x512 using LANCZOS.
    3. Save as WEBP with quality=82, method=6 (< 40KB).
    """
    arr = np.array(img.convert("RGB"))
    mask = (arr[:, :, 0] < 22) & (arr[:, :, 1] < 26) & (arr[:, :, 2] < 35)
    arr[mask] = [11, 14, 20]

    clean_img = Image.fromarray(arr)
    resized_img = clean_img.resize((512, 512), Image.Resampling.LANCZOS)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    resized_img.save(output_path, "WEBP", quality=82, method=6)


def extract_latest_image_base64(page: Page, timeout_sec: int = 60) -> str:
    """Wait for the generated image in Google AI Studio and extract its base64 data."""
    start_time = time.time()
    
    # JavaScript helper to fetch any image (blob:, http:, data:) and convert to base64 DataURL
    js_extract = """
    () => {
        // Look for model response images
        const imgs = Array.from(document.querySelectorAll('img')).filter(img => {
            const src = img.src || '';
            const rect = img.getBoundingClientRect();
            // Filter out small avatars / icons (thumbnails are usually < 100px)
            return rect.width > 120 && rect.height > 120 && !src.includes('googleusercontent.com/a/');
        });
        
        if (imgs.length === 0) return null;
        
        const lastImg = imgs[imgs.length - 1];
        
        return new Promise((resolve) => {
            fetch(lastImg.src)
                .then(r => r.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                })
                .catch(() => resolve(null));
        });
    }
    """

    while time.time() - start_time < timeout_sec:
        # Check if Run button is still active/generating or if a Stop button exists
        is_generating = page.locator('button:has-text("Stop"), [aria-label*="Stop"]').count() > 0
        
        data_url = page.evaluate(js_extract)
        if data_url and not is_generating:
            return data_url
        
        time.sleep(1.5)

    raise TimeoutError(f"Timed out waiting for generated image after {timeout_sec}s")


def submit_prompt_in_ai_studio(page: Page, prompt: str):
    """Find prompt textarea in AI Studio, input prompt, and trigger Run."""
    # Possible selectors for the AI Studio input box
    selectors = [
        'textarea[placeholder*="Type"]',
        'textarea[aria-label*="prompt" i]',
        'textarea[aria-label*="Type" i]',
        'div[contenteditable="true"]',
        'textarea',
    ]

    input_elem = None
    for sel in selectors:
        loc = page.locator(sel).last
        if loc.count() > 0 and loc.is_visible():
            input_elem = loc
            break

    if not input_elem:
        raise RuntimeError("Could not find prompt input textarea in Google AI Studio")

    # Focus and clear
    input_elem.click()
    page.keyboard.press("Control+A")
    page.keyboard.press("Backspace")

    # Type or paste prompt (use evaluate/clipboard for instant input of long prompt)
    input_elem.fill(prompt)
    time.sleep(0.5)

    # Press Ctrl+Enter to Run
    page.keyboard.press("Control+Enter")
    print("  Prompt submitted (Ctrl+Enter). Waiting for generation...")


def check_and_handle_login(page: Page):
    """Ensure user is logged in to Google AI Studio."""
    if "accounts.google.com" in page.url:
        print("\n=======================================================")
        print("  VUI LÒNG ĐĂNG NHẬP GOOGLE TRÊN TRÌNH DUYỆT VỪA MỞ!")
        print("  Sau khi đăng nhập xong và vào giao diện Google AI Studio,")
        print("  script sẽ tự động tiếp tục...")
        print("=======================================================\n")
        page.wait_for_url("**/aistudio.google.com/**", timeout=300000)
        time.sleep(3)


def main():
    parser = argparse.ArgumentParser(
        description="Batch generate Werewolf role icons using Playwright on Google AI Studio."
    )
    parser.add_argument("--test", action="store_true", help="Only run 3 representative roles (1 Werewolf, 1 Villager, 1 Third Party)")
    parser.add_argument("--force", action="store_true", help="Overwrite existing icons")
    parser.add_argument("--id", type=str, default=None, help="Generate for a specific role ID only")
    parser.add_argument("--cdp", type=str, default=None, help="Connect over Chrome DevTools Protocol (e.g. http://localhost:9222)")
    parser.add_argument("--profile", type=str, default=".chrome-profile", help="Path to persistent Chrome profile folder")
    parser.add_argument("--prompts", type=str, default="scripts/roles_prompts.json", help="Path to prompts JSON file")
    parser.add_argument("--output-dir", type=str, default="public/images/roles", help="Output directory")
    parser.add_argument("--headless", action="store_true", help="Run browser in headless mode (not recommended for first login)")
    args = parser.parse_args()

    prompts_path = Path(args.prompts)
    if not prompts_path.is_file():
        print(f"Error: Prompts file not found: {prompts_path}", file=sys.stderr)
        sys.exit(1)

    with open(prompts_path, "r", encoding="utf-8") as f:
        all_roles = json.load(f)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Filter roles
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

    print(f"Target count: {len(targets)} roles.")

    with sync_playwright() as p:
        if args.cdp:
            print(f"Connecting to existing Chrome via CDP at {args.cdp}...")
            browser = p.chromium.connect_over_cdp(args.cdp)
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            page = context.pages[0] if context.pages else context.new_page()
        else:
            profile_dir = Path(args.profile).resolve()
            profile_dir.mkdir(parents=True, exist_ok=True)
            print(f"Launching Chrome with persistent profile at: {profile_dir}...")
            context = p.chromium.launch_persistent_context(
                user_data_dir=str(profile_dir),
                channel="chrome",
                headless=args.headless,
                viewport={"width": 1280, "height": 850},
                args=["--disable-blink-features=AutomationControlled"],
            )
            page = context.pages[0] if context.pages else context.new_page()

        # Open AI Studio
        print("Navigating to Google AI Studio...")
        page.goto("https://aistudio.google.com/prompts/new_chat", wait_until="domcontentloaded")
        time.sleep(3)
        check_and_handle_login(page)

        total = len(targets)
        success_count = 0

        for idx, item in enumerate(targets, 1):
            role_id = item["id"]
            out_file = output_dir / f"{role_id}.webp"

            if out_file.exists() and not args.force:
                print(f"[{idx}/{total}] Skipping '{role_id}': {out_file} already exists.")
                continue

            print(f"\n[{idx}/{total}] Generating icon for '{role_id}' ({item.get('faction')})...")
            
            # Combine System Instructions and Role Prompt
            full_prompt = (
                f"{SYSTEM_INSTRUCTION}\n\n"
                f"CHARACTER SPECIFICATION:\n{item['prompt']}"
            )

            try:
                # Open a clean chat for each role to avoid context bleeding
                page.goto("https://aistudio.google.com/prompts/new_chat", wait_until="domcontentloaded")
                time.sleep(2)

                submit_prompt_in_ai_studio(page, full_prompt)
                data_url = extract_latest_image_base64(page, timeout_sec=60)
                
                # Decode base64 and save
                header, b64_str = data_url.split(",", 1)
                img = Image.open(io.BytesIO(base64.b64decode(b64_str)))
                post_process_and_save(img, out_file)
                size_kb = out_file.stat().st_size / 1024
                print(f"[{role_id}] ✓ Saved to {out_file} ({size_kb:.1f} KB)")
                success_count += 1

            except Exception as e:
                print(f"[{role_id}] ✗ Error generating: {e}", file=sys.stderr)

            time.sleep(2)

        print("\n--- Playwright Automation Completed ---")
        print(f"Total processed: {total}")
        print(f"Successfully generated: {success_count}")


if __name__ == "__main__":
    main()
