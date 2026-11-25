#!/usr/bin/env python3
"""
scripts/generate_role_icons_playwright.py

Automates Google AI Studio via Playwright to batch generate Werewolf role icons
using your configured Google AI Studio prompt session.
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

DEFAULT_AI_STUDIO_URL = "https://aistudio.google.com/prompts/1vX_GzpsFRu1QqqozfKCOyOUXzk4fByml"

# System Instructions and Style Locking fallback
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


def get_existing_image_srcs(page: Page) -> list:
    """Return list of existing large image src URLs in current page."""
    try:
        return page.evaluate("""
            () => Array.from(document.querySelectorAll('img'))
                .filter(img => {
                    const rect = img.getBoundingClientRect();
                    return rect.width > 80 && rect.height > 80 && !img.src.includes('googleusercontent.com/a/');
                })
                .map(img => img.src)
        """)
    except Exception:
        return []


def extract_new_image_base64(page: Page, initial_srcs: list, timeout_sec: int = 90) -> str | None:
    """Wait for a newly generated image in Google AI Studio and extract its base64 data.
    Never falls back to existing/old images in the session.
    Returns None if generation finishes without producing any new image.
    """
    start_time = time.time()
    initial_set = set(initial_srcs)

    js_extract = """
    (initialList) => {
        const initialSet = new Set(initialList || []);
        const imgs = Array.from(document.querySelectorAll('img')).filter(img => {
            const src = img.src || '';
            const rect = img.getBoundingClientRect();
            return (
                rect.width > 100 &&
                rect.height > 100 &&
                !src.includes('googleusercontent.com/a/') &&
                img.complete &&
                img.naturalWidth > 0
            );
        });

        // Strictly select only NEW images that did not exist before submission
        const newImgs = imgs.filter(img => !initialSet.has(img.src));
        if (newImgs.length === 0) return null;

        const targetImg = newImgs[newImgs.length - 1];

        return new Promise((resolve) => {
            fetch(targetImg.src)
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

    # Wait briefly for generation to start (Stop button appears or new image arrives)
    has_started = False
    for _ in range(10):
        if page.locator('button:has-text("Stop"), [aria-label*="Stop" i]').count() > 0:
            has_started = True
            break
        if page.evaluate(js_extract, list(initial_set)):
            has_started = True
            break
        time.sleep(0.5)

    idle_checks_after_finish = 0
    while time.time() - start_time < timeout_sec:
        is_generating = page.locator('button:has-text("Stop"), [aria-label*="Stop" i]').count() > 0
        if is_generating:
            has_started = True
            idle_checks_after_finish = 0
        else:
            data_url = page.evaluate(js_extract, list(initial_set))
            if data_url and isinstance(data_url, str) and data_url.startswith("data:image"):
                return data_url
            if has_started:
                idle_checks_after_finish += 1
                # Wait a couple of polls after Stop disappears in case image blob is still rendering
                if idle_checks_after_finish >= 3:
                    return None

        time.sleep(1.5)

    return None


def find_prompt_input(page: Page, timeout_sec: int = 30):
    """Wait for and return the main prompt input element in Google AI Studio."""
    selectors = [
        'ms-prompt-input-wrapper textarea',
        'ms-chunk-input textarea',
        'footer textarea',
        'textarea[aria-label*="Type something" i]',
        'textarea[placeholder*="Type something" i]',
        'textarea[placeholder*="Start typing" i]',
        'textarea[aria-label*="prompt" i]',
        'div[contenteditable="true"][role="textbox"]',
        'textarea:not([aria-label*="System" i])',
    ]

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        for sel in selectors:
            loc = page.locator(sel)
            count = loc.count()
            # Iterate from last to first (chat input is typically at the bottom)
            for i in range(count - 1, -1, -1):
                candidate = loc.nth(i)
                try:
                    if candidate.is_visible() and candidate.is_enabled():
                        return candidate
                except Exception:
                    continue
        time.sleep(1.0)

    # Diagnostic info if not found
    try:
        diag = page.evaluate("""
            () => ({
                url: window.location.href,
                textareas: Array.from(document.querySelectorAll('textarea')).map(t => ({
                    aria: t.getAttribute('aria-label'),
                    placeholder: t.getAttribute('placeholder'),
                    visible: t.offsetParent !== null
                })),
                editables: Array.from(document.querySelectorAll('[contenteditable="true"]')).length
            })
        """)
    except Exception:
        diag = {}
    raise RuntimeError(f"Could not find prompt input textarea in Google AI Studio after {timeout_sec}s. Diagnostics: {diag}")


def submit_prompt_in_ai_studio(page: Page, prompt: str):
    """Find prompt textarea in AI Studio, input prompt, and trigger Run."""
    input_elem = find_prompt_input(page, timeout_sec=30)

    # Focus and clear
    input_elem.click()
    page.keyboard.press("Control+A")
    page.keyboard.press("Backspace")

    # Paste prompt
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
    parser.add_argument("--url", type=str, default=DEFAULT_AI_STUDIO_URL, help=f"Google AI Studio prompt URL (default: {DEFAULT_AI_STUDIO_URL})")
    parser.add_argument("--include-system-instruction", action="store_true", help="Prepend SYSTEM_INSTRUCTION (omit if prompt session already has it)")
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
    print(f"Using Google AI Studio URL: {args.url}")

    with sync_playwright() as p:
        if args.cdp:
            print(f"Connecting to existing Chrome via CDP at {args.cdp}...")
            try:
                browser = p.chromium.connect_over_cdp(args.cdp)
            except Exception as e:
                print(
                    f"\n✗ Không thể kết nối tới Chrome CDP tại {args.cdp} ({e}).\n"
                    "Nguyên nhân thường gặp:\n"
                    "  1. Chrome chưa được mở với --remote-debugging-port=9222, hoặc đã có tiến trình Chrome khác chạy ngầm từ trước.\n"
                    "  2. Chrome phiên bản mới (136+) yêu cầu truyền thêm --user-data-dir khác thư mục mặc định khi bật remote debugging.\n\n"
                    "Cách khắc phục nhanh:\n"
                    "  - Cách A (Đơn giản nhất): Bỏ cờ --cdp, chạy trực tiếp:\n"
                    "      python scripts/generate_role_icons_playwright.py --test\n"
                    "    (Playwright sẽ tự mở Chrome riêng lưu đăng nhập vào .chrome-profile)\n"
                    "  - Cách B (Dùng CDP): Mở Chrome bằng lệnh:\n"
                    '      & "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\chrome-ai-studio"\n',
                    file=sys.stderr,
                )
                sys.exit(1)
            context = browser.contexts[0] if browser.contexts else browser.new_context()
            # Prefer an existing tab that is already on aistudio.google.com
            ai_tab = next((pg for pg in context.pages if "aistudio.google.com" in (pg.url or "")), None)
            page = ai_tab if ai_tab else (context.pages[0] if context.pages else context.new_page())
            try:
                page.bring_to_front()
            except Exception:
                pass
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

        # Open AI Studio configured session only if not already there
        if args.url not in (page.url or ""):
            print("Opening your Google AI Studio prompt session...")
            page.goto(args.url, wait_until="domcontentloaded")
            time.sleep(3)
        else:
            print("Already on target Google AI Studio session tab.")
        check_and_handle_login(page)

        total = len(targets)
        success_count = 0
        is_first_prompt = True

        for idx, item in enumerate(targets, 1):
            role_id = item["id"]
            out_file = output_dir / f"{role_id}.webp"

            if out_file.exists() and not args.force:
                print(f"[{idx}/{total}] Skipping '{role_id}': {out_file} already exists.")
                continue

            print(f"\n[{idx}/{total}] Generating icon for '{role_id}' ({item.get('faction')})...")
            
            # Decide prompt content
            if args.include_system_instruction:
                prompt_to_send = f"{SYSTEM_INSTRUCTION}\n\nCHARACTER SPECIFICATION:\n{item['prompt']}"
            else:
                prompt_to_send = item["prompt"]

            max_attempts = 3
            generated_ok = False

            for attempt in range(1, max_attempts + 1):
                try:
                    # For subsequent items or retries, reload prompt baseline URL to clear failed turn and keep clean state
                    if not is_first_prompt or attempt > 1:
                        page.goto(args.url, wait_until="domcontentloaded")
                        time.sleep(3)
                    is_first_prompt = False

                    initial_images = get_existing_image_srcs(page)
                    submit_prompt_in_ai_studio(page, prompt_to_send)
                    data_url = extract_new_image_base64(page, initial_images, timeout_sec=90)

                    if not data_url:
                        print(f"[{role_id}] ⚠ Không thấy ảnh mới được tạo ra (lần {attempt}/{max_attempts}). Xóa prompt và chạy lại...")
                        continue

                    # Decode base64 and save
                    header, b64_str = data_url.split(",", 1)
                    img = Image.open(io.BytesIO(base64.b64decode(b64_str)))
                    post_process_and_save(img, out_file)
                    size_kb = out_file.stat().st_size / 1024
                    print(f"[{role_id}] ✓ Saved to {out_file} ({size_kb:.1f} KB)")
                    success_count += 1
                    generated_ok = True
                    break

                except Exception as e:
                    print(f"[{role_id}] ✗ Error generating (attempt {attempt}/{max_attempts}): {e}", file=sys.stderr)

            if not generated_ok:
                print(f"[{role_id}] ✗ Bỏ qua sau {max_attempts} lần thử không có ảnh mới.", file=sys.stderr)

            time.sleep(2)

        print("\n--- Playwright Automation Completed ---")
        print(f"Total processed: {total}")
        print(f"Successfully generated: {success_count}")


if __name__ == "__main__":
    main()
