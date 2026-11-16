---
name: tailwind-shadcn
description: Style this app with Tailwind CSS and shadcn/ui. Use when changing visual components, responsive layouts, themes, or accessible controls.
---

Inspect the installed Tailwind version, CSS entry point, theme tokens, and existing shadcn/ui components before editing. `IDEA.md` names these technologies but the repo may not yet be bootstrapped.

- Use existing design tokens and component conventions; do not introduce a parallel styling system or hard-code repeated colors and spacing.
- Build mobile-first layouts that adapt to the lobby, player phone, and shared host screen. Handle long names, narrow widths, large text, and touch-sized controls.
- Prefer semantic shadcn/ui primitives already present. Add only the minimum component needed and follow repo component ownership.
- Preserve visible focus, keyboard interaction, accessible labels, and contrast. Disabled or hidden states must be understandable without relying only on color.
- Keep utility composition readable; extract a component when repeated markup or complex state warrants it, not just to shorten a class string.
