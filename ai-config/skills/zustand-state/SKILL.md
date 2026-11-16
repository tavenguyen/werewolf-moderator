---
name: zustand-state
description: Design client state with Zustand for this game UI. Use when adding stores, selectors, local interaction state, or reconnection behavior.
---

First inspect whether Zustand and an existing store pattern are present. Do not create a store merely because `IDEA.md` lists Zustand.

- Separate ephemeral UI state (dialogs, local selection, playback controls) from room/game state owned by the server.
- Never persist roles, secrets, or authoritative game outcomes in browser storage. Persist only the minimum reconnect token the product requires, using existing storage boundaries and careful error handling.
- Keep selectors narrow to avoid broad rerenders; derive values instead of maintaining duplicate state.
- Model connection, loading, and stale-state transitions explicitly. On reconnect, reconcile with a server snapshot instead of trusting stale client state.
- Avoid mutating state outside store actions and avoid persisting callbacks, sockets, or non-serializable resources.
