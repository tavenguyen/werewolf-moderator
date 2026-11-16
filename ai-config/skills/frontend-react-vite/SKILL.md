---
name: frontend-react-vite
description: Build or change user-facing UI for this React, TypeScript, and Vite app. Use for screens, components, mobile layouts, accessibility, and client interactions.
---

Before coding, inspect app structure, router, scripts, CSS setup, component library, and conventions. `IDEA.md` describes the intended stack but does not prove dependencies are installed. Reuse what exists; do not introduce Next.js or packages by default.

- Keep components focused, typed, and composed from reusable pieces where that improves clarity. Avoid giant page components and unnecessary abstraction.
- Treat server-provided room/game state as authoritative. UI state may control presentation and temporary interaction, but must not determine roles, deaths, votes, or win conditions.
- Cover loading, empty, error, disconnected, disabled, and success states for each relevant flow. Prevent duplicate submissions and give recoverable errors a clear next action.
- Design for small phones and shared host displays. Keep daytime screens glanceable and nighttime screens discreet; do not expose another player's private role in markup, state, logs, or error text.
- Use semantic HTML, keyboard-operable controls, visible focus, accessible names, and sufficient contrast. Do not encode status with color alone.
- Respect mobile audio/autoplay constraints, reduced-motion preferences where relevant, and safe cleanup of subscriptions, timers, and media resources.
- Follow repo route, styling, and testing conventions. Do not add a testing library until the project has one or the task calls for it.
