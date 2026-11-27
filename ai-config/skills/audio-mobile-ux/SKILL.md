---
name: audio-mobile-ux
description: Implement the host and player audio experience for mobile browsers. Use for Howler.js, night narration, background ambience, autoplay, audio ducking, or cleanup.
---

Inspect current audio assets, Howler version, host/player device roles, and browser-facing code before editing. The host is the only device intended to play shared audio.

- Treat autoplay as requiring an explicit user gesture; initialize/resume `Howler.ctx` inside direct user clicks before scheduled timers run, expose a clear way for the host to enable/resume audio, and handle rejected playback promises.
- Chain sequential cues via `onComplete` (e.g., `night_end` before `day_discuss` or `mayor_election`) so later narration never cancels an earlier announcement mid-sentence.
- Equalize real-turn and fake-turn duration distributions and include post-action eye-close cooldowns (`>= 3.5s`) and night-intro buffers (`night_start + 3.5s`) so players cannot deduce dead/alive roles from timing or get caught mid-handoff.
- Keep player devices silent. Do not use vibration or other sound cues to identify a private role or turn.
- Duck ambience while narration plays and restore the prior level when narration ends, fails, is interrupted, or the phase changes.
- Handle missing/corrupt audio and interrupted contexts without blocking the game; provide a recoverable host-facing status.
- Stop and unload audio on room exit or rematch as appropriate. Clean up handlers and avoid overlapping duplicate narration after reconnects.
- Verify sleep overlay, screen wake behavior, and audio controls do not reveal private information to others at the table.
