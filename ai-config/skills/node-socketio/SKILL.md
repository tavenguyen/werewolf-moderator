---
name: node-socketio
description: Implement Node.js, TypeScript, and Socket.io room behavior for this app. Use for events, room state, reconnects, validation, privacy, or timeout handling.
---

Inspect server entry points, Socket.io version, event types, room model, and scripts before changing behavior. `IDEA.md` is the product target; existing code and installed APIs determine implementation details.

- Validate every client event at the server boundary. Derive player identity from the server-validated token/session, not a client-supplied player id.
- Keep room state authoritative on the server. Filter and construct every outgoing payload for its recipient; never broadcast secrets or full internal state.
- Make state transitions atomic against concurrent socket events. Handle duplicate, late, malformed, unauthorized, and out-of-phase actions with stable errors.
- Design reconnect and disconnect explicitly: reauthenticate, resync from an authorized snapshot, preserve valid room membership, and avoid duplicate actions.
- Clear timers/listeners on phase changes and room cleanup. Use server time for deadlines and account for the specified end-of-night grace window.
- Keep game rules out of socket handlers; call the pure game engine and translate its result into protocol events.
- Do not log player tokens or private roles. Keep error details useful without leaking protected state.
