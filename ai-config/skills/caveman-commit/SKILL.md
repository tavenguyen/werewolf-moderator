---
name: caveman-commit
description: Write a concise Conventional Commit message from a diff. Use when asked for a commit message or to commit a change. Does not stage or commit files.
---

Write a concise, exact Conventional Commit message. Preserve the user's language in explanatory text; the message itself should follow repository conventions.

## Rules

- Format: `<type>(<optional scope>): <imperative summary>`.
- Use a fitting type such as `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, or `revert`.
- Prefer a subject of at most 50 characters; never exceed 72. Use imperative mood, no trailing period, and match repo capitalization.
- Add a body only for non-obvious reasons, breaking changes, migrations, or linked issues. Wrap body lines at 72 characters.
- Always include body context for breaking changes, security fixes, data migrations, and reverts.
- Avoid filler, first-person phrasing, emoji, and AI attribution unless the repository explicitly requires it.
- Output only the message in a code block, ready to paste.

## Boundary

Generate a message only. Never stage files, execute `git commit`, amend, or push.
