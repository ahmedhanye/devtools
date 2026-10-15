---
name: to-tickets
description: Break a plan, spec, or conversation into tracer-bullet tickets with blocking edges, published locally or to a tracker.
disable-model-invocation: true
---

# To tickets

Break a plan, spec, or conversation into tracer-bullet tickets, each declaring its blocking dependencies. Follow Git and GitHub CLI workflows in `CONTRIBUTING.md`.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference, such as a spec path, issue number, or URL as an argument, fetch it and read its full body and comments.

Completion criterion: Target context, spec, or ticket loaded and read completely.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Use vocabulary from `.agents/GLOSSARY.md` and respect ADRs in `.agents/docs/adr/`.

Look for prefactoring opportunities to simplify the change.

Completion criterion: Codebase boundaries mapped and prefactoring opportunities identified.

### 3. Draft vertical slices

Break the work into tracer bullet tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but complete path through every layer, including schema, API, UI, and tests: vertical, not a horizontal slice of one layer.
- A completed slice is demoable or verifiable on its own.
- Each slice is sized to fit in a single fresh context window.
- Any prefactoring should be done first.

</vertical-slice-rules>

Declare blocking edges for each ticket. A ticket with no blockers can start immediately.

Wide refactors are the exception to vertical slicing. A wide refactor is one mechanical change, such as renaming a column or retyping a shared symbol, whose blast radius fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Do not force it into a tracer bullet; sequence it as expand-contract. First expand by adding the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius, by package or directory, each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract by deleting the old form once no callers remain, in a ticket blocked by every migrate batch.

Completion criterion: Vertical slices drafted with declared blocking edges.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title.** Short descriptive name.
- **Blocked by.** Other tickets that must complete first, if any.
- **Delivered capability.** The end-to-end behavior this ticket makes work.

Ask the user:

- Does the granularity feel right, or is it too coarse or too fine?
- Are the blocking edges correct? Confirm each ticket depends only on tickets that genuinely gate it.
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

Completion criterion: Breakdown approved by the user without pending revisions.

### 5. Publish the tickets

Determine the target destination from the user's prompt:

- **Local files (default).** Unless the user explicitly requests publishing to GitHub or a remote tracker, save tickets locally under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Use the template below with `# <NN>: <Ticket title>` prepended and a `### Blocked by` section listing blocking ticket numbers or `None (can start immediately)`. Write one ticket per file, never a single combined file.
- **GitHub.** When the user explicitly requests publishing to GitHub or the issue tracker, create one issue per ticket in dependency order (blockers first) with title prefix `[Slice]: <title>` and label `type:feat`. Use the ticket template below for the issue body. If the ticket belongs to a parent Spec, attach it as a native sub-issue. Declare any blocking dependencies to gate start order.

Leave parent Specs open in the issue tracker until all child tickets reach Done.

Completion criterion: All approved tickets published locally or created as linked GitHub issues.

<ticket-template>

### Primary affected area

Select the primary workspace app or package from `apps/*` or `packages/*`, or `toolchain / infra`.

### Slice objective and user value

The end-to-end behavior this ticket makes work from the user perspective.

### Vertical slice scope

Describe how these layers collaborate to deliver the end-to-end behavior above as a single vertical path.

- **Schema and database.** Migrations, schemas, or contract types. State none if untouched.
- **Logic and services.** Domain logic, route handlers, or error handling.
- **User interface and presentation.** Components, layout, or state hooks. State none if untouched.
- **Tests.** Unit tests, integration tests, or contract assertions.

### Automated acceptance criteria

- [ ] Automated verification suite passes
- [ ] Behavioral tests pass for new functionality

</ticket-template>

Avoid specific file paths or code snippets because they go stale quickly. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose (state machine, reducer, schema, or type shape), inline it and note that it came from a prototype.
