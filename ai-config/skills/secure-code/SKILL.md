---
name: secure-code
description: Apply secure-by-default practices when implementing features that handle untrusted input, network events, authorization, credentials, tokens, or private game data in this repository. Do not load for unrelated visual-only work.
---

# Secure Code for Ma Sói Host

Use this skill when a change crosses a trust boundary. Follow `IDEA.md`, existing code, and the relevant domain skill; this skill adds security checks without inventing product behavior or infrastructure.

## Trust boundaries

- Treat browser input, query parameters, local storage, QR payloads, socket events, and reconnect data as untrusted. Validate at the boundary and pass narrowed domain values inward; TypeScript types alone do not validate runtime input.
- Derive player identity and permissions from server-validated session/token state. Never authorize an action from a client-supplied player id, role, alive status, phase, or host flag.
- Keep the server authoritative for roles, room membership, phase, actions, votes, and outcomes. Build each outgoing payload for its intended recipient; do not broadcast internal room state and rely on the UI to hide it.
- Treat the shared-device mode as physically observable. Do not claim it can protect secrets from someone with access to the device or DevTools.

## Sensitive data and rendering

- Send each player only the role/action information needed for their current turn. Keep host public-screen payloads free of private roles unless the game is over and reveal is intended.
- Do not put player tokens, private roles, or other secrets in logs, error messages, analytics, URLs, or public UI. Follow the existing token persistence contract; do not broaden token lifetime or storage without a concrete requirement.
- Render player-provided text as text. Avoid unsafe HTML sinks and validate/allowlist navigable URL schemes when URLs can be influenced by users.
- Do not add security dependencies or headers without checking the actual app/server framework, deployment boundary, and project need.

## Actions and failures

- Check authentication, authorization, current phase, target eligibility, and payload shape before applying a state-changing action. Keep validation and transition atomic where concurrent events can race.
- Handle duplicate, late, malformed, unauthorized, and out-of-phase events with stable, useful errors that reveal no protected state. Do not partially apply an action before validation completes.
- Use cryptographically secure randomness for security-sensitive tokens. For game randomness, follow the game engine's existing behavior and requirements; do not conflate fairness requirements with authentication secrets.
- Keep security failure logs useful for operators while excluding tokens, private roles, and raw sensitive payloads.

## Before finishing

- Trace the changed value from its source through validation, authorization, state mutation, and any client response.
- Check that unauthorized clients cannot infer private roles or perform another player's action, including through errors, reconnect snapshots, or public host views.
- Run only security checks and project commands that actually exist. Report what was checked and any deployment/runtime assumptions that remain unverified.

## Sources

Adapted for this project from [OWASP Secure Agent Playbook](https://github.com/OWASP/secure-agent-playbook) and [OpenAI Security Best Practices](https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices). Project-specific rules in `AGENTS.md` and `IDEA.md` take precedence.
