---
name: implement-with-qa
description: Implement requirements, run diff-scoped QA, fix unambiguous defects, and report open trade-offs.
disable-model-invocation: true
---

1. **Implement the work.** Follow [`.agents/skills/implement/SKILL.md`](../implement/SKILL.md) to build and verify the requested requirements.
2. **Run diff-scoped QA.** Run [`.agents/skills/qa/SKILL.md`](../qa/SKILL.md) in diff-scoped mode across the changed files, then proceed to step 3 before replying to the user.
3. **Fix unambiguous defects.** Fix any QA defects that need no user review or architectural trade-off by running `implement` on them again.
4. **Report outcomes.** Save a Markdown report in the session artifact directory covering completed work, key decisions, intentional requirement deviations with rationale, QA results, and open trade-offs for user decision. Link the report and summarize the outcome in chat in at most 15 lines.
