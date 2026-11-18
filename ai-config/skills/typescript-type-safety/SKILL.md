---
name: typescript-type-safety
description: Design and troubleshoot TypeScript types when modeling domain states, public APIs, untrusted inputs, generics, or compiler errors. Use alongside the relevant project domain skill; this skill does not replace React, game-engine, or Socket.io guidance.
---

# TypeScript Type Safety

Use TypeScript to make invalid states harder to express and to expose real mistakes at compile time. Follow the existing `tsconfig` and project patterns; do not weaken checks to silence an error.

## Type design

- Use literal unions or discriminated unions for a finite set of states and actions. Narrow on the discriminant and handle every variant when the operation requires it.
- Use `unknown` for data from JSON, sockets, storage, or other untyped boundaries. Validate or narrow it before using it as a domain value; a type assertion alone does not validate runtime data.
- Prefer inferred local types. Add explicit types where they clarify exported APIs, callbacks, or non-obvious contracts.
- Add a generic only when callers need to preserve or vary a relationship between types. Constrain it to the operations the implementation requires.
- Use `satisfies` when a value must conform to a type while retaining its specific inferred shape.
- Prefer a direct, readable type over deep conditional or mapped types. Use branded types only when the code actually risks mixing otherwise identical domain values.

## Project boundaries

- Keep game-state and action types aligned with the rules in `IDEA.md`; do not invent behavior to make a type model convenient.
- Validate external event payloads at the boundary before passing them into domain logic. Keep authorization and authoritative game state on the server.
- Do not add runtime schema packages, compiler flags, lint rules, or type-level abstractions as part of an ordinary feature unless the task requires them.
- When fixing a type error, trace the value to its source and correct the model or validation. Do not silence it with `any`, a broad assertion, or disabled compiler checks.

## Before finishing

- Check that all relevant variants are handled and boundary values cannot bypass validation.
- Run the repository's existing type-check/build command when the change warrants it. Report checks actually run and any remaining compiler or runtime uncertainty.

Adapted from [Miaoge-Ge's TypeScript Expert skill](https://github.com/Miaoge-Ge/coding-agent-skills/blob/main/plugins/typescript-expert/skills/typescript-expert/SKILL.md).
