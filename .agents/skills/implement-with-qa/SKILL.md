---
name: implement-with-qa
description: Implement requirements, run diff-scoped QA, fix unambiguous defects, and report open trade-offs.
disable-model-invocation: true
---

Act as a thin coordinator that preserves context by delegating coding and verification to fresh subagents while tracking decisions, diffs, and QA outcomes:

1. **Implement in a subagent.** Dispatch one subagent to run [`.agents/skills/implement/SKILL.md`](../implement/SKILL.md) through full completion verification and doc updates. Require it to return decisions made, a summary of changed files, verification commands with results, and any caveats.
2. **Run diff-scoped QA.** Run [`.agents/skills/qa/SKILL.md`](../qa/SKILL.md) in diff-scoped mode across the changed files, then proceed to step 3 before replying to the user.
3. **Fix unambiguous defects in a subagent.** If QA reports unambiguous defects that need no user review or architectural trade-off, dispatch one fresh subagent running `implement` on them (passing the QA report paths and prior decisions) through full completion verification and doc updates, returning updated decisions, changes, and verification results.
4. **Report outcomes.** Synthesize completed work, key decisions, intentional requirement deviations with rationale, QA results, fix outcomes, and open trade-offs into one de-duplicated Markdown report in the session artifact directory. Link the report and summarize the outcome in chat in at most 15 lines.
