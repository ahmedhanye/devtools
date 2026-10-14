---
name: to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker).
disable-model-invocation: true
---

# To Tickets

Break a plan, spec, or conversation into a set of tickets: tracer-bullet vertical slices, each declaring the tickets that block it.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project domain glossary vocabulary, and respect ADRs in the area you are touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into tracer bullet tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but complete path through every layer (schema, API, UI, tests): vertical, not a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its blocking edges: the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

Wide refactors are the exception to vertical slicing. A wide refactor is one mechanical change (rename a column, retype a shared symbol) whose blast radius fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Do not force it into a tracer bullet; sequence it as expand-contract. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish the tickets

Publish the approved tickets:

- **Local files**: write one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Use the local ticket template below: one ticket per file, never a single combined file.
- **GitHub**: publish one issue per ticket in dependency order (blockers first) with title prefix `[Slice]: <title>` and label `type:feat`. Use the issue template below. Attach each ticket to its parent Spec as a native sub-issue, and link blockers using native blocking dependencies.

Work the frontier: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

<local-ticket-template>

# <NN>: <Ticket title>

### Slice Objective & User Value

The end-to-end behaviour this ticket makes work from the user perspective.

### Vertical Slice Scope

- **Schema & DB:** (migrations, schemas, contract types)
- **Logic & Services:** (domain logic, route handlers, error handling)
- **UI & Presentation:** (client components, state hooks)
- **Tests:** (unit tests, integration tests, contract assertions)

### Blocked by

The numbers or titles of the tickets that gate this one, or "None (can start immediately)".

### Automated Acceptance Criteria

- [ ] Automated verification suite passes
- [ ] Behavioral tests pass for new functionality

</local-ticket-template>

<issue-template>

### Primary Affected Area

Select one: `@devtools/cli`, `@devtools/api`, `@devtools/frontend`, `@devtools/core`, `@devtools/db`, `toolchain / infra`, or `cross-cutting / all`.

### Slice Objective & User Value

The end-to-end behaviour this ticket makes work from the user perspective.

### Vertical Slice Scope

- **Schema & DB:** (migrations, schemas, contract types)
- **Logic & Services:** (domain logic, route handlers, error handling)
- **UI & Presentation:** (client components, state hooks)
- **Tests:** (unit tests, integration tests, contract assertions)

### Automated Acceptance Criteria

- [ ] Automated verification suite passes
- [ ] Behavioral tests pass for new functionality

### Ticket Invariants

- [x] Atomic vertical slice deliverable in a single PR.
- [x] Linked to parent Spec via native sub-issue without direct milestone assignment.

</issue-template>

Avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype.
