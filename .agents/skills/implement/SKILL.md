---
name: implement
description: Implement requirements from any source using TDD, scoped verification, and documentation updates.
disable-model-invocation: true
---

## Workflow

1. **Resolve requirements.** Read the target requirements from the prompt, spec, ticket, handoff, or other source. If the user passes a ticket reference, fetch it from the issue tracker and state its title before editing. Ask if any reference or requirement is ambiguous.
2. **Build and verify the change.** Read [`.agents/skills/tdd/SKILL.md`](../tdd/SKILL.md) before writing production code whenever testable behavior exists, and follow [`REVIEW.md`](../../../REVIEW.md) to run iterative compound checks during edits and matching completion checks across every changed path until every check exits `0`.
3. **Update documentation.** Inspect the verified diff for changes to public behavior, interfaces, commands, configuration, architecture, or workflows. When any doc needs changes, read [`.agents/skills/writing-docs/SKILL.md`](../writing-docs/SKILL.md), update every affected document (root `*.md`, `docs/**`, or package or app READMEs), and run the matching `REVIEW.md` doc completion check until it exits `0`.
