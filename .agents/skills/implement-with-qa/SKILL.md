---
name: implement-with-qa
description: Implement requirements, run diff-scoped QA, fix unambiguous defects, and report outcomes.
disable-model-invocation: true
---

Act as a thin coordinator that preserves context by delegating coding and verification to fresh subagents while tracking decisions, diffs, and QA outcomes. Pass specs, handoffs, and skill paths by reference while leaving `.agents/skills/implement/SKILL.md`, `.agents/skills/tdd/SKILL.md`, and implementation source files unread in coordinator context.

1. **Implement in a subagent.** Dispatch one subagent to run [`.agents/skills/implement/SKILL.md`](../implement/SKILL.md) through full completion verification and documentation updates, returning its changes summary and any unconfirmed test seams or caveats.
   Completion criterion: Implementation subagent finishes with passing verification and returns its changes summary.
2. **Run diff-scoped QA.** Run [`.agents/skills/qa/SKILL.md`](../qa/SKILL.md) in diff-scoped mode across the changed files, then proceed to step 3 before replying to the user.
   Completion criterion: All three diff-scoped QA axis reports exist.
3. **Fix unambiguous defects in a subagent.** If QA reports unambiguous defects that need no user review or architectural trade-off, dispatch one fresh subagent running `implement` on them, passing the QA report paths and prior decisions, through full completion verification and documentation updates.
   Completion criterion: Every unambiguous QA defect is fixed and verified, or none were reported.
4. **Report outcomes.** Follow [`.agents/skills/changes-summary/SKILL.md`](../changes-summary/SKILL.md) to write one combined report artifact that also includes QA fix outcomes and, when applicable, open decisions, architectural trade-offs, unconfirmed test seams, and future considerations. In chat, summarize what was done in at most 15 lines and link the three QA reports and the summary artifact.
   Completion criterion: Summary artifact and chat reply with links to all three QA reports are delivered.
