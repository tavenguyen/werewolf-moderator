---
name: clean-code
description: Apply project-fit clean code rules when writing, refactoring, or reviewing TypeScript and React code in this repository. Use for requests to simplify code, improve maintainability, or address duplication, unclear names, overly complex components, unsafe types, and error handling.
---

# Clean Code for Ma Sói Host

Make code easier to understand and change while preserving the requested behavior. Prefer the smallest clear change; do not introduce abstractions, dependencies, or architecture without a concrete benefit.

## Working rules

- Inspect the affected call paths and existing conventions first. Keep the diff scoped to the task.
- Use names that explain intent and prefer named exports over default exports (unless a framework entrypoint requires default export) for safer refactoring. Extract a function or component when it gives a coherent responsibility a useful name; do not split code just to reduce line count.
- Remove repeated logic when one shared implementation will stay clearer. Keep data and behavior near the domain that owns them.
- Preserve strict TypeScript. Prefer precise types, `readonly` data/immutable updates, and narrowing; use `unknown` for untrusted values and `catch (error: unknown)` and validate/narrow them at system boundaries. Avoid `any` and casts that only silence the compiler.
- Model meaningful alternatives with explicit types and handle all variants. Keep UI presentation separate from game rules; backend state remains authoritative for roles, deaths, votes, and outcomes.
- Handle expected failures and cleanup explicitly. Prefer `async/await` (with `Promise.all` for independent parallel tasks) over nested `.then()` chains; do not swallow errors, leave timers/listeners running, or expose private roles or tokens in messages and logs.
- Keep React state minimal. Derive simple values during render; use effects for synchronization with external systems and clean up subscriptions, timers, and media resources.
- Do not impose tools the repository does not have. Check `package.json` and existing configuration before suggesting or running lint, format, or test commands.

## Before finishing

- Review the diff for behavior changes, duplicated code, stale comments, unnecessary indirection, and missed cleanup/error paths.
- Check edge cases explicitly: empty/absent data (`undefined` vs `false`), room-exit/F5 persistence (never re-save empty state on leave), stale filters/round numbers across phase transitions, and accidental-tap defaults.
- Run only checks available in the repository and report their actual results. For refactors, compare the affected user flows and keep visible behavior unchanged unless the task asks otherwise.
- For requested reviews, report actionable findings with severity, location, impact, and a concrete trigger. Separate correctness issues from personal style preferences.
