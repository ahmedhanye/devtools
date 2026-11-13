---
name: implement
description: Implement requirements from any source using TDD and scoped verification.
disable-model-invocation: true
---

1. **Resolve requirements.** Read the target requirements from the prompt, spec, ticket, handoff, or other source. If the user passes a ticket reference, fetch it from the issue tracker and state its title before editing. Ask if any reference or requirement is ambiguous.
2. **Build the change.** Apply [`.agents/skills/tdd/SKILL.md`](../tdd/SKILL.md) wherever testable behavior exists.
3. **Verify the diff.** Follow [`REVIEW.md`](../../../REVIEW.md) to run iterative compound checks during edits and matching completion checks across every changed path until every check exits `0`.
