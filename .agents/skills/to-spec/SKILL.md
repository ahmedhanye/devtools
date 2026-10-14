---
name: to-spec
description: Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you have already discussed.
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec. Do not interview the user; synthesize what you already know.

## Process

1. Explore the repo to understand the current state of the codebase, if you have not already. Use the project domain glossary vocabulary throughout the spec, and respect any ADRs in the area you are touching.

2. Sketch the seams at which you are going to test the feature. Prefer existing seams to new ones. Use the highest seam possible. The fewer seams across the codebase, the better.

Check with the user that these seams match their expectations.

3. Write the spec using the template below and publish it with title prefix `[Spec]: <title>` and label `type:spec`.

<spec-template>

### Primary Affected Area

Select one: `@devtools/cli`, `@devtools/api`, `@devtools/frontend`, `@devtools/core`, `@devtools/db`, `toolchain / infra`, or `cross-cutting / all`.

### Capability Overview & Problem Statement

What capability this spec introduces, and what concrete technical problem or user need it solves.

### Target Architecture & Seams

Module boundaries, package interactions, schemas, interface contracts, and the seams chosen for testing. If a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it here.

### Security & Non-Functional Boundaries

Supply chain constraints, secret handling rules, fork security boundaries, performance invariants, or telemetry restrictions.

### High-Level Acceptance Criteria & Milestone Goals

Observable conditions defining capability completion:

- [ ] Automated verification suite passes
- [ ] All child tickets delivered and verified

### Governance Check

- [x] Milestones belong exclusively to Specs, not Tickets.
- [x] This spec will be broken down into atomic child tickets linked via native sub-issues.

</spec-template>
