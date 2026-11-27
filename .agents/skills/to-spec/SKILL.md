---
name: to-spec
description: Synthesize the current conversation and repository context into a spec issue on GitHub.
disable-model-invocation: true
---

# To spec

Turn decisions already made in conversation and repository context into a clear problem-and-outcome spec rather than running a fresh requirements interview.

1. **Discover conventions and context.** Inspect available repository issue docs and templates (such as `CONTRIBUTING.md`, linked issue guides, and `.github/ISSUE_TEMPLATE/`), relevant `GLOSSARY.md` terms and `ARCHITECTURE.md` constraints (including linked ADRs) when present, affected areas of the codebase, and live GitHub labels and active milestones.

   Completion criterion: Available repository issue rules, live labels and milestones, and affected context read.

2. **Draft and confirm the proposal.** Write the draft spec to a Markdown session artifact (such as `spec_proposal_<slug>.md`) matching the repository's spec template when present, or the minimal fallback below. Include planned metadata (clean title, matching label, and an active milestone only when the spec is a user-facing release deliverable rather than internal DX or tooling) plus any open assumptions, link the artifact in chat, and wait for user confirmation.

   Completion criterion: Proposal artifact shared in chat and explicitly approved by the user.

3. **Publish to GitHub.** Create the spec issue using the approved metadata and repository conventions, then return its URL.

   Completion criterion: Spec issue created on GitHub and issue URL returned.

## Fallback spec structure

When the repository defines no spec template, keep only sections that add concrete value:

- **Overview and problem.** What capability this introduces and what concrete problem it solves.
- **Expected outcome and acceptance criteria.** Observable checklist items proving the capability is complete.
- **Scope and boundaries (optional).** Out-of-scope items, non-functional limits, or cross-module boundaries when non-obvious.
