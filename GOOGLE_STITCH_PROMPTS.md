# Google Stitch Prompts — Ma Sói Host

Tạo **từng màn hình riêng**, không yêu cầu Stitch ghép cả ứng dụng thành một ảnh. Dán prompt tương ứng bên dưới. Mỗi prompt đã lặp lại Design System để giữ cùng tông màu và component style. Stitch chỉ dựng bố cục/hình ảnh tham khảo; logic runtime và accessibility sẽ được xử lý khi viết frontend.

## Màn 1 — Trang chủ: Vào phòng và tạo phòng

```text
Design a polished mobile web app screen for “Ma Sói Host”, a face-to-face Werewolf game companion. Canvas: 390x844 mobile.

DESIGN SYSTEM — use consistently: Modern Dark Atmospheric, modern and minimal with a subtle moonlit mystery; no ornate medieval/fantasy decoration. Main background #0B0E14. Cards/surfaces #161B26 with a subtle 1px rgba(255,255,255,0.08) border. Wolf, warning, poison and execution accent #EF4444. Night phase indigo #6366F1. Moonlight, timer and primary action accent #F59E0B. Villager and healing accent #10B981. Use a modern sans-serif such as Inter or Plus Jakarta Sans; tabular numerals for timers. Mobile touch controls are 48–56px tall. Use consistent spacing, corner radius, icon style, and semantic colors. Day/lobby screens must be clearly readable with WCAG AA contrast. Night-only screens later use a separate low-luminance OLED treatment.

Screen content: Center a crescent-moon mark and app name near the top. Below, show two clear modes as tabs or large cards: “Tham gia phòng” and “Tạo phòng”. Join mode has a large four-digit room-code field, a scan-QR action, username field, and prominent “Vào phòng” button. Create mode lets the host choose “Một điện thoại dùng chung” or “Phòng nhiều điện thoại”, and then offers “Tạo phòng mới”. Make the two device modes understandable in one short line each. Keep the layout calm, compact, and immediately usable; do not add chat, marketing copy, or unrelated settings.
```

## Màn 2 — Lobby và cài đặt phòng

```text
Design the lobby and room-settings screen for “Ma Sói Host” as one responsive web product screen. Provide a mobile layout at 390x844 and a laptop layout at 1440x900; keep the same visual system and rearrange columns rather than changing style.

DESIGN SYSTEM — use consistently: Modern Dark Atmospheric, modern and minimal with a subtle moonlit mystery; no ornate medieval/fantasy decoration. Main background #0B0E14. Cards/surfaces #161B26 with a subtle 1px rgba(255,255,255,0.08) border. Wolf, warning, poison and execution accent #EF4444. Night phase indigo #6366F1. Moonlight, timer and primary action accent #F59E0B. Villager and healing accent #10B981. Use a modern sans-serif such as Inter or Plus Jakarta Sans; tabular numerals for timers. Mobile touch controls are 48–56px tall. Use consistent spacing, corner radius, icon style, and semantic colors. Day/lobby screens must be clearly readable with WCAG AA contrast. Night-only screens later use a separate low-luminance OLED treatment.

Show room code and a scannable QR prominently, plus connected-player pills with a green connection dot and a clear host marker. Host-only settings include Smart Preset, a Villager–Wolf balance meter, and compact rule toggles with short helper text: reveal role on death, wolf skip, friendly fire, Witch heal mode, victim knowledge, wasted empty heal, self-heal, tie/runoff mode, and ghost mode. Make dependent Witch settings visually conditional. Show a clear “Bắt đầu ván” disabled state and reason until the room meets the configured minimum player count.

Represent both device modes without mixing them: in “Một điện thoại dùng chung”, show the host entering all player usernames and confirming a circular seating order, then a one-time setup card for sequential private role reveal before the game begins (optional manual role entry if the group uses physical cards); do not imply that the phone will be passed around at night. In “Phòng nhiều điện thoại”, show the join QR/code and each player’s own connected device state. Mobile is one column; laptop can use two balanced columns. No chat.
```

## Màn 3 — Pha đêm và Sleep Overlay

```text
Design the night-phase mobile screen for “Ma Sói Host”. Canvas: 390x844. Show two states of the same screen: sleeping/waiting and the active called role.

DESIGN SYSTEM — use consistently: Modern Dark Atmospheric, modern and minimal with a subtle moonlit mystery; no ornate medieval/fantasy decoration. Main background #0B0E14. Cards/surfaces #161B26 with a subtle 1px rgba(255,255,255,0.08) border. Wolf, warning, poison and execution accent #EF4444. Night phase indigo #6366F1. Moonlight, timer and primary action accent #F59E0B. Villager and healing accent #10B981. Use a modern sans-serif such as Inter or Plus Jakarta Sans; tabular numerals for timers. Mobile touch controls are 48–56px tall. Use consistent spacing, corner radius, icon style, and semantic colors. IMPORTANT night exception: sleeping and night-action states use OLED black #000000, very low luminance, deep red or subdued gray text, and no large bright surfaces so the phone does not light players’ faces. Use large, stable controls/icons for close-range use; do not force daytime WCAG brightness onto this screen.

Sleeping state: almost entirely pure black, a very dim instruction “Hãy úp điện thoại xuống bàn”, and a restrained sleep icon. Avoid bright white text, panels, glow, or decorative moonlight.

Active state: show a slim low-luminance timer and the called role/action instruction. Use large, clearly separated player targets and a two-step confirmation treatment for one-use abilities. For the Witch, show “Kích hoạt Bình Cứu đêm nay”, the victim only if room settings allow it, and a separate poison-target area.

Show the two device-mode variants. In one-device mode, the phone stays fixed in the center of a circular table; include a simple circular seating diagram that helps the called player identify their seat. The called player opens eyes, reaches to the device, completes their action, then closes eyes; there is no passing/handoff between players at night. After the action, return to the black sleep state. In multi-device mode, this is the private player phone; devices outside the active turn remain black. The host device is the only audio source. Do not show another player’s role.
```

## Màn 4 — Pha ngày / Eyes-Up

```text
Design the daytime discussion and voting screen for “Ma Sói Host”. Canvas: 390x844 mobile. The screen should be glanceable while players talk face-to-face.

DESIGN SYSTEM — use consistently: Modern Dark Atmospheric, modern and minimal with a subtle moonlit mystery; no ornate medieval/fantasy decoration. Main background #0B0E14. Cards/surfaces #161B26 with a subtle 1px rgba(255,255,255,0.08) border. Wolf, warning, poison and execution accent #EF4444. Night phase indigo #6366F1. Moonlight, timer and primary action accent #F59E0B. Villager and healing accent #10B981. Use a modern sans-serif such as Inter or Plus Jakarta Sans; tabular numerals for timers. Mobile touch controls are 48–56px tall. Use consistent spacing, corner radius, icon style, and semantic colors. This is a daytime screen: readable text and controls must meet WCAG AA contrast.

Place a large centered circular countdown timer at the top. Below it, show a compact player grid: living players are clear, dead players are dimmed and struck through, and the Mayor/Trưởng làng has a crown icon plus a text label. Do not rely on color alone. Keep the center uncluttered and omit chat and long history.

Show the first-60-second voting lock with a visible countdown and disabled “Mở bảng Vote” button. Include the public discussion controls for pause and +30 seconds where the current user is host. After voting unlocks, represent secret vote on each personal phone and show-of-hands tally for the shared single-device mode. On the shared phone, include public host actions for recording raised hands and closing the execution vote. Also show contextual daytime actions when relevant: Hunter chooses a target after being announced dead; Mayor chooses a successor within the 10-second window. Keep these actions distinct from ordinary voting. Respect pause/extension state without visually implying that the initial vote lock has elapsed when it has not.
```

## Màn 5 — Bảng điều khiển trung tâm cho Host

```text
Design the central host dashboard for “Ma Sói Host”. Desktop canvas: 1440x900, with a sensible tablet fallback. This is a shared screen visible to the whole table, so show public information only.

DESIGN SYSTEM — use consistently: Modern Dark Atmospheric, modern and minimal with a subtle moonlit mystery; no ornate medieval/fantasy decoration. Main background #0B0E14. Cards/surfaces #161B26 with a subtle 1px rgba(255,255,255,0.08) border. Wolf, warning, poison and execution accent #EF4444. Night phase indigo #6366F1. Moonlight, timer and primary action accent #F59E0B. Villager and healing accent #10B981. Use a modern sans-serif such as Inter or Plus Jakarta Sans; tabular numerals for timers. Controls must be easy to reach and readable at a glance. Use consistent spacing, corner radius, icon style, and semantic colors. This is a lobby/day/shared host screen: text and controls must meet WCAG AA contrast.

Use a spacious three-column layout: left 25% with all players and alive/dead status plus “Loại khẩn cấp” tucked into a secondary menu; center 50% with a very large timer, phase/role-call status, pause, +30 seconds, and “Chốt kết quả Vote ngoài đời”; right 25% with narration/music volume sliders and a compact room QR for reconnecting players. Use clear hierarchy and avoid decorative dashboards or chat.

Show the central-board variant only: this device has public status and audio controls, never private roles. For the single-device mode, this is the shared phone-sized control surface represented responsively, not a second host screen; public daytime actions remain available on the fixed table device.
```

## Màn 6 — Tổng kết và giải mã ván đấu

```text
Design the completed-game reveal screen for “Ma Sói Host”. Provide mobile 390x844 and desktop 1440x900 layouts with the same design system.

DESIGN SYSTEM — use consistently: Modern Dark Atmospheric, modern and minimal with a subtle moonlit mystery; no ornate medieval/fantasy decoration. Main background #0B0E14. Cards/surfaces #161B26 with a subtle 1px rgba(255,255,255,0.08) border. Wolf, warning, poison and execution accent #EF4444. Night phase indigo #6366F1. Moonlight, timer and primary action accent #F59E0B. Villager and healing accent #10B981. Use a modern sans-serif such as Inter or Plus Jakarta Sans; tabular numerals for any times. Use consistent spacing, corner radius, icon style, and semantic colors. This is a post-game screen: readable text and controls must meet WCAG AA contrast.

Start with a prominent but restrained winner banner with distinct outcomes for Villagers, Wolves, or Draw. Below, use two simple tabs: “Vai trò” with a player grid showing each avatar/name/true role, and “Dòng thời gian” with concise night-by-night events (protection, wolf attacks, Witch heal/poison, friendly fire, chained deaths). Make event order readable without turning the screen into a dense log.

At the bottom, show “Đảo bài & Chơi ván mới” for the host and “Rời phòng” for everyone. Rematch retains room players and settings. Do not show living players’ roles before the game has ended. Keep the same hierarchy and spacing on mobile and desktop; no chat.
```
