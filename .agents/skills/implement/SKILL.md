---
name: implement
description: Implement work based on a spec or tickets with smart verification.
disable-model-invocation: true
---

# Implement

Implement the work described by the user in the spec or tickets.

If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask.

Call the Skill tool with `tdd` where possible, at pre-agreed seams.

Verify your work smartly following [`REVIEW.md`](../../../REVIEW.md): run the compound iterative checks during edits and completion checks at the end.
