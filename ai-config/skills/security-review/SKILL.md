---
name: security-review
description: Review code changes for concrete security vulnerabilities when explicitly asked for a security review or when a change crosses an authentication, authorization, network, secret, or private-data boundary. Not a general style review.
---

# Security Review for Ma Sói Host

Review the actual diff and relevant call paths. Do not edit files while reviewing. Use `code-review` as well when the change also affects gameplay correctness, races, reconnects, or error handling.

## Review method

1. Identify the trust boundary, attacker-controlled inputs, protected data, and intended authorization rules from `IDEA.md` and the implementation.
2. Trace each relevant value from source to validation, authorization, state mutation, response, rendering, storage, or logging.
3. Verify protections in code rather than assuming framework defaults. Check recipient-specific socket payloads, reconnect snapshots, host/public views, and error paths for role or token leakage.
4. Consider malformed, replayed, duplicated, stale, unauthorized, and out-of-phase requests where they can bypass a security decision or expose data.
5. Report only actionable, evidence-backed vulnerabilities. Separate confirmed code defects from risks that depend on deployment configuration or runtime behavior; do not present generic hardening suggestions as vulnerabilities.

## Findings

For each finding, include severity (`critical`, `high`, `medium`, or `low`), file and line, affected trust boundary, concrete impact, and a reproducible trigger. Explain the evidence and a focused remediation. If a concern cannot be verified from the repository, label the missing assumption and what evidence would confirm it.

Do not report style preferences, speculative attacks without a reachable path, or protections that are outside the changed behavior unless they create a concrete exploit. If there are no actionable findings, say so and list material checks or deployment assumptions that remain unverified.

## Sources

Adapted from [Sentry security-review](https://github.com/getsentry/skills/tree/main/skills/security-review) and [OWASP Secure Agent Playbook](https://github.com/OWASP/secure-agent-playbook). The repository's `code-review` skill remains the source for general correctness and game-specific review priorities.
