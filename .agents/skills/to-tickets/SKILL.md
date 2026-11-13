---
name: to-tickets
description: Break a plan, spec, or conversation into tracer-bullet tickets with blocking edges, published locally or to GitHub.
disable-model-invocation: true
---

# To tickets

Break a plan, spec, or conversation into vertical tracer-bullet tickets with explicit blocking dependencies.

## Process

1. **Gather context and repository rules.** Read every present repository issue guide and template (such as `CONTRIBUTING.md`, `docs/contributing/issues.md`, and `.github/ISSUE_TEMPLATE/`), plus any architecture, testing, glossary, and ADR docs (such as `ARCHITECTURE.md`, `TESTING.md`, `GLOSSARY-MAP.md`, `GLOSSARY.md`, `docs/glossary/`, and `docs/adr/`). Work from the conversation context, or fetch the referenced spec, file, issue, or URL in full (body and comments). Check live GitHub labels and parent issue details when publishing to GitHub.

   Completion criterion: All present issue rules, templates, and architecture, testing, glossary, and ADR docs read, and target context, spec, or issue loaded completely.

2. **Explore codebase boundaries.** If not already explored, inspect the codebase so slices align with existing modules, canonical domain terms, and architecture decisions. Note any prefactoring that makes the upcoming change easier.

   Completion criterion: Affected boundaries understood, domain terms and ADRs aligned, and prefactoring needs identified.

3. **Draft vertical slices.** Split the work into tracer-bullet tickets with explicit blocking edges (`Blocked by`):

   - Cut each slice as a narrow, complete vertical path across every applicable layer (such as schema, logic, interface, and tests) rather than a single-layer horizontal slice.
   - Make each completed slice independently demoable or verifiable and sized for one fresh context window.
   - Schedule any prefactoring ticket first, with dependent slices blocked by it.
   - **Wide-refactor exception.** Sequence mechanical codebase-wide changes (such as renaming a column or retyping a shared symbol) as expand-contract instead of forcing one vertical slice:
     1. **Expand.** Add the new form alongside the old so existing callers stay green.
     2. **Migrate.** Convert callers in bounded batches (by package or directory), each as a ticket blocked by the expand ticket.
     3. **Contract.** Remove the old form in a final ticket blocked by every migration batch.
   - Frame each slice around the problem and observable expected outcome across public interfaces and external seams. Keep internal file paths, helper names, internal mechanics, unrequested technical solutions, and rules already documented in `CODING_STANDARDS.md` or `TESTING.md` out of ticket contracts; cite a specific route, CLI command, or status code only when that external interface is itself the contract. Inline a short snippet only when a prototype produced a decision-rich shape such as a state machine, reducer, schema, or type.

   Completion criterion: Every requirement covered by standalone, context-sized slices (or expand-contract batches) with minimal accurate blocking edges.

4. **Propose via artifact and confirm.** Write the proposed breakdown to a Markdown artifact in the session artifact directory (such as `ticket_proposal_<slug>.md`) instead of pasting it in chat. Include a Mermaid dependency graph (or ordered summary table) showing blocking edges, each ticket's title, blockers, delivered end-to-end behavior, target destination (local files or GitHub with planned labels and parent spec), and any unconfirmed assumptions from starting without an agreed spec or plan. Link the artifact in chat, ask whether granularity, splits or merges, and blocking edges look right, and wait for explicit user confirmation before publishing.

   Completion criterion: Proposal artifact linked in chat and explicitly confirmed by the user with no pending revisions.

5. **Publish the tickets.** Publish in dependency order (blockers first), matching repository issue templates, labels, title rules, and milestone conventions when present, or the template below otherwise:

   - **Local files (default).** Unless the user asks to publish to GitHub, write each ticket to its own file under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`. Prepend `# <NN>: <Ticket title>` and include `### Blocked by` listing blocking ticket numbers or `None (can start immediately)`.
   - **GitHub (when requested).** Create one GitHub issue per ticket. Link each ticket to its parent spec as a sub-issue and record blocking dependencies natively when supported, or in the issue body otherwise. Leave any parent spec open until all child tickets reach done.

   Completion criterion: Every approved ticket published in dependency order locally or to GitHub with parent and blocking edges recorded, and all file paths or issue URLs returned.

## Ticket template

Include only sections that add concrete value for the slice. Treat `Problem statement` (and any optional repository template fields) as optional, omitting any unnecessary or self-evident section completely instead of writing boilerplate or "N/A".

```markdown
### Problem statement

Concrete user pain point, missing capability, or technical defect this slice addresses.

### Expected behavioral contract

Observable behavioral contracts, public seams, and user-facing capabilities delivered when this slice is complete.

### Automated acceptance criteria

- [ ] Verification suite passes
- [ ] Observable behavioral contracts pass across public seams
```
