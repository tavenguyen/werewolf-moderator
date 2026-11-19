---
name: code-review
description: Independently review a code change for correctness, security, edge cases, error handling, and test gaps. Use after implementation or when asked to review.
---

Review the requested behavior and diff against the actual repository. Do not edit files. Trace affected call paths and inspect relevant tests before reporting.

Prioritize: incorrect game outcomes; private-role or room-data leakage; race conditions and duplicate actions; broken reconnect, timeout, or error handling; mobile text clipping/overflow (320px-390px screens with max-length names); horizontal scroll leaks; regressions; missing meaningful tests. Ignore style-only preferences unless they hide a defect.

For each finding, provide severity (`critical`, `high`, `medium`, or `low`), file and line, concrete impact, and reproduction/triggering condition. Lead with findings. If none, state that no actionable finding was found and note important unverified risks or checks not run.
