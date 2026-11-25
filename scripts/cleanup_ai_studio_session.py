#!/usr/bin/env python3
"""
scripts/cleanup_ai_studio_session.py

Clean up old input/output turns in a Google AI Studio prompt session via Playwright,
keeping only the latest valid reference turn pair (1 input + 1 output) and removing
any broken 'No image generated' turns.
"""

import sys
import time
import argparse
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, Page
except ImportError:
    print("Error: 'playwright' is not installed. Please run: pip install playwright", file=sys.stderr)
    sys.exit(1)

DEFAULT_AI_STUDIO_URL = "https://aistudio.google.com/prompts/1vX_GzpsFRu1QqqozfKCOyOUXzk4fByml"


def wait_for_ai_studio_ready(page: Page, timeout_sec: int = 30):
    """Wait until chat turns or prompt input are rendered in AI Studio."""
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if page.locator("ms-chat-turn").count() > 0 or page.locator("textarea").count() > 0:
            time.sleep(2.0)
            return
        time.sleep(1.0)
    raise TimeoutError("Google AI Studio did not finish loading within timeout.")


def inspect_turns(page: Page) -> list[dict]:
    """Return metadata for each ms-chat-turn currently in the session."""
    return page.evaluate("""
        () => {
            const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
            return turns.map((t, idx) => {
                const text = (t.innerText || '').trim().replace(/\\s+/g, ' ');
                const imgs = Array.from(t.querySelectorAll('img')).filter(img => {
                    const rect = img.getBoundingClientRect();
                    return rect.width > 80 && rect.height > 80 && !img.src.includes('googleusercontent.com/a/');
                });
                const isModel = t.querySelector('[data-turn-role="Model"], .model-prompt-container') !== null
                    || t.className.toLowerCase().includes('model')
                    || text.toLowerCase().includes('no image generated')
                    || imgs.length > 0;
                return {
                    index: idx,
                    hasImage: imgs.length > 0,
                    isBroken: text.toLowerCase().includes('no image generated'),
                    isModel,
                    preview: text.slice(0, 70)
                };
            });
        }
    """)


def delete_turn_at_index(page: Page, idx: int) -> bool:
    """Hover over ms-chat-turn[idx], open its options menu, and click Delete."""
    turn = page.locator("ms-chat-turn").nth(idx)
    turn.scroll_into_view_if_needed()
    turn.hover()
    time.sleep(0.3)

    # Try direct delete button first if present, otherwise open the three-dots menu
    menu_selectors = [
        'button[aria-label*="more" i]',
        'button[aria-label*="options" i]',
        'button[aria-label*="menu" i]',
        'button:has(mat-icon:text-is("more_vert"))',
        'button:has-text("more_vert")',
    ]

    menu_btn = None
    for sel in menu_selectors:
        loc = turn.locator(sel)
        if loc.count() > 0:
            for i in range(loc.count()):
                cand = loc.nth(i)
                if cand.is_visible():
                    menu_btn = cand
                    break
        if menu_btn:
            break

    if not menu_btn:
        return False

    menu_btn.click()
    time.sleep(0.35)

    # Click Delete in the Angular CDK overlay menu
    delete_selectors = [
        'div.cdk-overlay-container [role="menuitem"]:has-text("Delete")',
        'div.cdk-overlay-container button:has-text("Delete")',
        '[role="menuitem"]:has-text("Delete")',
        'button:has-text("Delete")',
    ]

    for dsel in delete_selectors:
        del_loc = page.locator(dsel)
        if del_loc.count() > 0 and del_loc.first.is_visible():
            del_loc.first.click()
            time.sleep(0.4)
            return True

    # Close menu if Delete wasn't found
    page.keyboard.press("Escape")
    return False


def main():
    parser = argparse.ArgumentParser(
        description="Delete old turns in a Google AI Studio session, keeping only the latest reference."
    )
    parser.add_argument("--url", type=str, default=DEFAULT_AI_STUDIO_URL, help="Google AI Studio prompt URL")
    parser.add_argument("--keep", type=int, default=2, help="Number of latest turns to keep (default: 2 = 1 input + 1 output)")
    parser.add_argument("--cdp", type=str, default="http://localhost:9222", help="Chrome CDP URL (default: http://localhost:9222)")
    parser.add_argument("--dry-run", action="store_true", help="Preview which turns would be deleted without deleting")
    parser.add_argument("--no-save", action="store_true", help="Do not press Ctrl+S after cleanup")
    args = parser.parse_args()

    with sync_playwright() as p:
        print(f"Connecting to Chrome via CDP at {args.cdp}...")
        try:
            browser = p.chromium.connect_over_cdp(args.cdp)
        except Exception as e:
            print(f"✗ Không thể kết nối Chrome CDP tại {args.cdp}: {e}", file=sys.stderr)
            sys.exit(1)

        context = browser.contexts[0] if browser.contexts else browser.new_context()
        ai_tab = next((pg for pg in context.pages if "aistudio.google.com" in (pg.url or "")), None)
        page = ai_tab if ai_tab else (context.pages[0] if context.pages else context.new_page())
        try:
            page.bring_to_front()
        except Exception:
            pass

        if args.url not in (page.url or ""):
            print(f"Navigating to {args.url}...")
            page.goto(args.url, wait_until="domcontentloaded")

        wait_for_ai_studio_ready(page)
        turns = inspect_turns(page)
        print(f"Found {len(turns)} turn(s) in session.")

        if len(turns) <= args.keep:
            print(f"Session already has <= {args.keep} turns. Nothing to delete.")
            return

        # Determine which turns to keep:
        # Find the latest turn with an image (if any) and keep it + its preceding input turn
        keep_indices = set()
        last_img_idx = None
        for t in reversed(turns):
            if t["hasImage"] and not t["isBroken"]:
                last_img_idx = t["index"]
                break

        if last_img_idx is not None and args.keep >= 2 and last_img_idx > 0:
            keep_indices = {last_img_idx - 1, last_img_idx}
        elif last_img_idx is not None and args.keep == 1:
            keep_indices = {last_img_idx}
        else:
            # Fallback: keep the last `args.keep` turns
            keep_indices = set(range(max(0, len(turns) - args.keep), len(turns)))

        to_delete = [t for t in turns if t["index"] not in keep_indices]
        to_keep = [t for t in turns if t["index"] in keep_indices]

        print("\nTurns to KEEP:")
        for t in to_keep:
            print(f"  [#{t['index']}] img={t['hasImage']} | {t['preview']}")

        print(f"\nTurns to DELETE ({len(to_delete)}):")
        for t in to_delete:
            tag = "BROKEN" if t["isBroken"] else ("IMG" if t["hasImage"] else "TEXT")
            print(f"  [#{t['index']}] ({tag}) | {t['preview']}")

        if args.dry_run:
            print("\n[Dry run] No turns were deleted.")
            return

        # Delete in descending index order so indices of earlier turns stay valid
        deleted = 0
        for t in sorted(to_delete, key=lambda x: x["index"], reverse=True):
            idx = t["index"]
            ok = delete_turn_at_index(page, idx)
            if ok:
                deleted += 1
                print(f"  ✓ Deleted turn #{idx}")
            else:
                print(f"  ✗ Could not delete turn #{idx} (menu/delete button not found)", file=sys.stderr)

        print(f"\nDone: Deleted {deleted}/{len(to_delete)} turns.")

        if deleted > 0 and not args.no_save:
            print("Saving session (Ctrl+S)...")
            page.keyboard.press("Control+S")
            time.sleep(2.0)
            print("✓ Save triggered.")


if __name__ == "__main__":
    main()
