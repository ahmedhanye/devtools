---
name: human-qa
description: Three-axis QA followed by human verification, grilling on findings, and remediation handoff.
disable-model-invocation: true
---

1. **Run QA and request verification.** Run [`.agents/skills/qa/SKILL.md`](../qa/SKILL.md), then ask the user to review the reports, perform any listed human verification checks, and reply with results. End the turn and wait for the user's reply before starting step 2.
2. **Grill on open findings.** Follow [`.agents/skills/grilling/SKILL.md`](../grilling/SKILL.md) to resolve user-reported issues, ambiguous specifications, and genuine design trade-offs. Treat straightforward test gaps and standards fixes as settled unless the user objects, then ask to confirm creating the handoff and wait for confirmation before starting step 3.
3. **Write the remediation handoff.** Follow [`.agents/skills/handoff/SKILL.md`](../handoff/SKILL.md) to save a remediation handoff capturing the goal, settled decisions, files and tests to update, verification commands, and QA report links.
