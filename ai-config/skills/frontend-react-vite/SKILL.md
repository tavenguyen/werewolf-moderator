---
name: frontend-react-vite
description: Build or change user-facing UI for this React, TypeScript, and Vite app. Use for screens, components, mobile layouts, accessibility, and client interactions.
---

Before coding, inspect app structure, router, scripts, CSS setup, component library, and conventions. `IDEA.md` describes the intended stack but does not prove dependencies are installed. Reuse what exists; do not introduce Next.js or packages by default.

- Keep components focused, typed, and composed from reusable pieces where that improves clarity. Avoid giant page components and unnecessary abstraction.
- Treat server-provided room/game state as authoritative. UI state may control presentation and temporary interaction, but must not determine roles, deaths, votes, or win conditions.
- Cover loading, empty, error, disconnected, disabled, and success states for each relevant flow. Prevent duplicate submissions and give recoverable errors a clear next action.
- Design for small phones and shared host displays. Keep daytime screens glanceable and nighttime screens discreet; do not expose another player's private role in markup, state, logs, or error text.
- Prevent text clipping and overflow across viewports (320px to 428px mobile up to desktop). For dynamic or user-generated text (nicknames up to 24 chars, room codes, status banners):
  - Always pair flex children with `min-width: 0` to prevent parent blowout.
  - Avoid rigid single-row locks that squeeze text beside action buttons into unreadable fragments; wrap or stack actions on compact screens.
  - Ensure critical identification data (room codes, player names) remains fully legible and not prematurely severed by aggressive `text-overflow: ellipsis`.
  - Use `overflow-wrap: anywhere` or `word-break: break-word` where long unbroken names could cause horizontal overflow.
- Use semantic HTML, keyboard-operable controls, visible focus, accessible names, and sufficient contrast. Do not encode status with color alone.
- Respect mobile audio/autoplay constraints, reduced-motion preferences where relevant, and safe cleanup of subscriptions, timers, and media resources.
- Guard room-exit and state-transition edge cases: clear `publicView`, `roomCode`, `privateView`, `postGameView`, and persisted storage on `leaveRoom` (never re-persist an empty room after removing storage), and reset derived UI filters/selections (`in_game` filter, modals, selected targets) whenever their backing room/deck/phase disappears.
- Prevent accidental-tap and layout edge cases: disable primary confirm buttons until an explicit target is chosen (separate skip actions), never auto-advance past social verdict/Last Words moments, apply multi-column grid classes only when every column renders content (otherwise center single-column), and keep screen roots fitted to `100dvh` without excess bottom padding causing unintended page scroll.
- Follow repo route, styling, and testing conventions. Do not add a testing library until the project has one or the task calls for it.
