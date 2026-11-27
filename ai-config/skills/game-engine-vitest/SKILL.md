---
name: game-engine-vitest
description: Implement or review pure game rules and Vitest coverage for Ma Sói Host. Use for night/day resolution, roles, deaths, votes, and win/draw conditions.
---

Read the relevant section of `IDEA.md` and inspect the current domain model before changing rules. Keep the engine deterministic and independent of Socket.io, React, timers, and random globals; inject randomness/time where required.

- Represent phases and actions explicitly. Reject invalid or out-of-phase actions without partially mutating state.
- Resolve the complete death chain (including couple and Hunter effects) before checking victory or draw. Preserve death order and causes for post-game history.
- Keep attack causes distinct: Witch heal cancels only eligible `WOLF_PACK` attacks; poison and White Wolf attacks remain distinct. Apply poison after AoE heal as specified.
- Cover friendly fire, wolf-skip, tied pack votes, protection history, witch potion availability/self-heal, dead-role fake turns, and Hunter's morning shot.
- Distinguish `undefined` (role/feature absent) from `false` (condition not met), and avoid emitting negative absence banners (`"Gấu yên lặng"`) that leak role death when `revealOnDeath = false`.
- Keep `roundNumber` synchronized with the visible phase (do not increment `roundNumber` prematurely while holding a day verdict), and compute vote totals/caps from `voteWeight` (Mayor = 2, revealed Village Idiot = 0) rather than `alivePlayers.length`.
- Test simultaneous, boundary, and lifecycle cases: both factions eliminated in one chain, no eligible targets, repeated submissions, ties, `leaveRoom` (clearing storage and `publicView` so F5 does not rejoin), and `rematch` / abort returning to `LOBBY`. Assert final state and emitted domain events/history.
- Use Vitest patterns already in the repo. Do not add libraries or couple tests to sockets/UI.
