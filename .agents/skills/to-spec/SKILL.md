---
name: to-spec
description: Synthesize the current conversation and codebase understanding into a published capability specification.
disable-model-invocation: true
---

# To spec

Synthesize conversation context and codebase understanding into a spec, confirming testing seams before publishing. Follow Git and GitHub CLI workflows in `CONTRIBUTING.md`.

## Process

1. Explore the repository to understand the current state of the codebase, if you have not already. Use vocabulary from `GLOSSARY-MAP.md` (and context glossaries under `docs/glossary/`) throughout the spec, and respect any ADRs in `docs/adr/`.

Completion criterion: Target packages identified, glossary vocabulary cross-referenced, and relevant ADRs checked.

2. Sketch the seams for testing the feature. Prefer existing seams to new ones. Use the highest seam possible. The fewer seams across the codebase, the better. The ideal number is one.

Confirm with the user that these seams match expectations.

Completion criterion: Testing seams identified and user confirmation recorded in context.

3. Write the spec using the template below and publish it as an issue with title prefix `[Spec]: <title>`, label `type:spec`, and the assigned capability milestone.

Completion criterion: Spec issue published with prefix `[Spec]: <title>`, labeled `type:spec`, assigned to active milestone, and issue URL returned.

<spec-template>

### Primary affected area

Select the primary workspace app or package from `apps/*` or `packages/*`, or `toolchain / infra`.

### Capability overview and problem statement

What capability this spec introduces, and what concrete technical problem or user need it solves.

### User stories

Numbered list of user stories covering personas, core paths, edge cases, and failure modes:
1. As an <actor>, I want <capability>, so that <benefit>.

Example:
1. As a CLI user running in CI, I want the command to return non-zero exit codes on lint failures, so that broken builds are halted.

### In and out of scope

- **In scope.** Concrete boundaries delivered under this capability.
- **Out of scope.** Related capabilities, premature optimizations, or deferred integrations.

### Target architecture

Module boundaries, package interactions, schemas, and interface contracts. If a prototype produced a snippet that encodes a decision more precisely than prose (state machine, reducer, schema, or type shape), inline it here.

### Testing decisions

- Seams and modules tested. Favor the highest possible seam and test external behavior rather than internals.
- Prior art or existing fixtures reused.

### Security and non-functional boundaries

Supply chain constraints, secret handling rules, fork security boundaries, performance invariants, or telemetry restrictions.

### High-level acceptance criteria and milestone goals

Observable conditions defining capability completion:

- [ ] Automated verification suite passes
- [ ] All child tickets delivered and verified

</spec-template>
