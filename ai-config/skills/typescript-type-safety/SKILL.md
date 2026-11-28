---
name: typescript-type-safety
description: Design and troubleshoot TypeScript types when modeling domain states, public APIs, untrusted inputs, generics, or compiler errors. Use alongside the relevant project domain skill; this skill does not replace React, game-engine, or Socket.io guidance.
---

# TypeScript Type Safety

Use TypeScript to make invalid states harder to express and to expose real mistakes at compile time. Follow the existing `tsconfig` and project patterns; do not weaken checks to silence an error.

## Type design

- Use literal unions or discriminated unions for a finite set of states, roles, phases, and actions. Narrow on the discriminant and enforce exhaustiveness with a `never` check so new variants fail at compile time when unhandled.
- Default to immutability for domain state and configs: prefer `readonly` properties, `ReadonlyArray<T>`, and `as const` for literal tables/event constants, returning new copies instead of mutating shared objects in place.
- Use `unknown` for data from JSON, sockets, storage, caught errors (`catch (error: unknown)`), or other untyped boundaries. Validate or narrow it before using it as a domain value; a type assertion alone does not validate runtime data.
- Prefer inferred local types. Add explicit parameter and return types where they clarify exported APIs, callbacks, or non-obvious contracts.
- Add a generic only when callers need to preserve or vary a relationship between types. Constrain it to the operations the implementation requires.
- Use `satisfies` when a value must conform to a type while retaining its specific inferred shape.

## Advanced contract types & compiler guardrails

- Keep ordinary domain logic types direct and readable; reserve template literal types, mapped types (including `as` key remapping), and conditional `infer` for shared Socket/API event maps, type-safe view projections (e.g. stripping private role fields), or reusable utilities.
- Use branded types only when the code actually risks mixing otherwise identical primitives.
- Protect compiler performance (`tsc -b`): avoid deeply nested or unconstrained conditional types, cap recursion depth in recursive types, and prefer flat unions or interfaces over heavy type-level computation.

## Project boundaries

- Keep game-state and action types aligned with the rules in `IDEA.md`; do not invent behavior to make a type model convenient.
- Validate external event payloads at the boundary before passing them into domain logic. Keep authorization and authoritative game state on the server.
- Do not add runtime schema packages, compiler flags, lint rules, or type-level abstractions as part of an ordinary feature unless the task requires them.
- When fixing a type error, trace the value to its source and correct the model or validation. Do not silence it with `any`, a broad assertion, or disabled compiler checks.

## Before finishing

- Check that all relevant variants are handled and boundary values cannot bypass validation.
- Run the repository's existing type-check/build command when the change warrants it. Report checks actually run and any remaining compiler or runtime uncertainty.

Adapted from [Miaoge-Ge's TypeScript Expert skill](https://github.com/Miaoge-Ge/coding-agent-skills/blob/main/plugins/typescript-expert/skills/typescript-expert/SKILL.md), with selected patterns from [jwynia/agent-skills (`typescript-best-practices`)](https://github.com/jwynia/agent-skills) and [wshobson/agents (`typescript-advanced-types`)](https://github.com/wshobson/agents).
