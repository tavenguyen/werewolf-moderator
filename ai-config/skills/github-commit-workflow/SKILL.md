---
name: github-commit-workflow
description: Safely prepare and create a local Git commit when the user explicitly asks to commit. Use with caveman-commit; this workflow does not push or create pull requests.
---

Use only when the user explicitly asks to commit. This covers local commits only; do not push, create branches, open pull requests, or configure GitHub Actions.

1. Confirm the current directory is inside the intended Git repository. If not, stop and explain; never initialize a repository automatically.
2. Inspect `git status --short`, relevant diffs, and existing commit conventions. Identify pre-existing user changes and leave unrelated files and hunks untouched.
3. Stage only files or hunks needed for this task, using explicit paths. If a file mixes requested and unrelated edits, stage only relevant hunks. Never use `git add -A` or `git add .`.
4. Inspect the staged diff and confirm it contains only intended changes. Unstage unrelated content without discarding work; inspect again.
5. Use `caveman-commit` to produce a Conventional Commit message from the staged diff.
6. Run `git commit` with that message only after confirming scope. Do not amend or rewrite existing commits.
7. Report commit hash and subject, plus any unrelated or uncommitted work left in the worktree. Never push.

If the boundary between this task and another person's changes is unclear, stop before staging or committing and explain the ambiguity.
