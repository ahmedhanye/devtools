---
name: implement
description: Implement requirements using TDD, verification, documentation updates, and a visual changes summary.
disable-model-invocation: true
---

## Workflow

1. **Resolve requirements.** Read the target requirements from the prompt, spec, ticket, handoff, or other source. If the user passes a ticket reference, fetch it from the issue tracker and state its title before editing. Ask only when requirements or public boundaries are genuinely ambiguous.
   Completion criterion: Target requirements and scope constraints are confirmed.
2. **Build and verify the change.** Read [`.agents/skills/tdd/SKILL.md`](../tdd/SKILL.md) before writing production code whenever testable behavior exists. When requirements, grilling decisions, or a handoff already settle the public interfaces and seams, proceed directly into red then green slices without pausing to re-confirm seams, and note any unconfirmed judgment-call seams for the closing report. Run targeted tests during edits, confirm new assertions fail when the guarded behavior breaks, and run canonical verification following [`REVIEW.md`](../../../REVIEW.md) after edits finish.
   Completion criterion: All required tests and `REVIEW.md` verification exit `0`.
3. **Update documentation.** Inspect the verified diff for changes to public behavior, interfaces, commands, configuration, architecture, or workflows. Skip documentation edits when the requirements explicitly defer docs, such as to a later stacked pull request. Otherwise, when any document needs changes, read [`.agents/skills/writing-docs/SKILL.md`](../writing-docs/SKILL.md) and update every affected document.
   Completion criterion: Affected documentation is updated, or confirmed unnecessary or deferred.
4. **Summarize changes.** Follow [`.agents/skills/changes-summary/SKILL.md`](../changes-summary/SKILL.md).
   Completion criterion: Visual changes summary artifact is written and linked in chat.
