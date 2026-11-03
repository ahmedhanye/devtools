---
name: human-qa
description: Three-axis QA followed by human verification, grilling on findings, and remediation handoff.
disable-model-invocation: true
---

# Human-in-the-loop quality assurance

### 1. Execute QA and prompt for verification
Run [`.agents/skills/qa/SKILL.md`](../qa/SKILL.md). At the end of the summary, ask the user to review the reports, run any checks listed under `Human verification required` (if present), and reply with their verification results or feedback on the findings.
**Stop here and end your turn. Wait for the user to reply before starting step 2.**

### 2. Grill on findings
Read [`.agents/skills/grilling/SKILL.md`](../grilling/SKILL.md) to resolve user-reported issues, ambiguous specifications, or findings with genuine design trade-offs (treat straightforward test gaps and standards fixes as settled unless the user objects). Conclude by asking confirmation to generate the handoff document.
**Stop here and end your turn. Wait for user confirmation before starting step 3.**

### 3. Remediation handoff
Read [`.agents/skills/handoff/SKILL.md`](../handoff/SKILL.md) to write `.scratch/handoff/<timestamp>-<slug>.md` capturing the remediation goal, settled decisions, files and tests to update, verification commands, and links to the QA reports.
