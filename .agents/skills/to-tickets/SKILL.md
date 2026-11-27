---
name: to-tickets
description: Split a spec, plan, or conversation into actionable tickets and publish them to GitHub.
disable-model-invocation: true
---

# To tickets

Break a spec, plan, or conversation into vertical tracer-bullet tickets with explicit blocking dependencies.

1. **Load source and repository conventions.** Read the referenced spec, file, or issue (including comments) or synthesize the current conversation. Inspect available repository issue docs and templates (such as `CONTRIBUTING.md`, linked issue guides, and `.github/ISSUE_TEMPLATE/`), relevant codebase boundaries, relevant `GLOSSARY.md` terms and `ARCHITECTURE.md` constraints (including linked ADRs), and live GitHub labels and parent issue details when publishing to GitHub.

   Completion criterion: Source work loaded in full, available repository issue rules and live labels checked, and affected boundaries understood.

2. **Slice the work cleanly.** Split work into vertical tracer-bullet tickets across affected layers, each independently verifiable and sized for one focused task, with explicit `Blocked by` edges.

   - Frame each ticket strictly around the problem and observable expected outcome across public interfaces, omitting internal file paths, helper names, implementation or tooling mechanics, and existing codebase patterns not explicitly requested by the user.
   - Keep every acceptance criterion specific and observable for the slice, omitting generic test, lint, or build boilerplate already enforced by repository standards.
   - Sequence wide cross-cutting refactors as expand, migrate in bounded batches, and contract when a single vertical slice is impractical.
   - Match each ticket's label from the live repository labels (such as feature, bug, refactor, test, docs, infra, or research) rather than assuming one type for every ticket.

   Completion criterion: Complete work breakdown drafted with vertical or expand-contract slices, accurate blocking edges, and matching labels.

3. **Propose and confirm.** Write the proposed tickets and dependency graph or table (titles, blockers, delivered outcome, labels, parent spec, and target destination) to a Markdown session artifact (such as `ticket_proposal_<slug>.md`), link it in chat, and wait for user confirmation.

   Completion criterion: Proposal artifact linked in chat and approved by the user.

4. **Publish in dependency order.** Default to creating GitHub issues (blockers first), matching the repository's ticket template and conventions, linking each child ticket to its parent spec and recording blocking dependencies natively when supported or in the body otherwise. Write numbered files under `.scratch/<feature-slug>/issues/<NN>-<slug>.md` instead only when requested or when no GitHub remote is configured. Return all issue URLs or file paths.

   Completion criterion: Approved tickets published in dependency order with parent and blocking links recorded, and all URLs or paths returned.

## Fallback ticket structure

When the repository defines no ticket template, keep only sections that add value:

- **Problem (optional).** Concrete defect, gap, or motivation for the slice.
- **Expected outcome.** Observable behavior across public interfaces when done.
- **Acceptance criteria.** Verifiable checks proving the expected outcome holds.
