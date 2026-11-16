---
name: game-engine-vitest
description: Implement or review pure game rules and Vitest coverage for Ma Sói Host. Use for night/day resolution, roles, deaths, votes, and win/draw conditions.
---

Read the relevant section of `IDEA.md` and inspect the current domain model before changing rules. Keep the engine deterministic and independent of Socket.io, React, timers, and random globals; inject randomness/time where required.

- Represent phases and actions explicitly. Reject invalid or out-of-phase actions without partially mutating state.
- Resolve the complete death chain (including couple and Hunter effects) before checking victory or draw. Preserve death order and causes for post-game history.
- Keep attack causes distinct: Witch heal cancels only eligible `WOLF_PACK` attacks; poison and White Wolf attacks remain distinct. Apply poison after AoE heal as specified.
- Cover friendly fire, wolf-skip, tied pack votes, protection history, witch potion availability/self-heal, dead-role fake turns, and Hunter's morning shot.
- Test simultaneous and boundary cases, including both factions eliminated in one chain, no eligible targets, repeated submissions, and ties. Assert final state and emitted domain events/history.
- Use Vitest patterns already in the repo. Do not add libraries or couple tests to sockets/UI.
