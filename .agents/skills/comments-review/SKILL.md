---
name: comments-review
description: Review pull request comments against repository truth and author a review report. Use when reviewing PR comments, inspecting review feedback, or auditing open PR threads.
---

# Review pull request comments

Review pull request comments against repository truth directly in the main agent session without dispatching a dedicated subagent. This skill is read-only: do not edit codebase files, stage git commits, push branches, or resolve review threads. Follow the investigation rules and thread query in [docs/contributing/pr-comments.md](../../../docs/contributing/pr-comments.md).

## Workflow

### 1. Fetch unresolved threads

Query open review threads for the target pull request using the GraphQL query from the contributing documentation. If no threads remain open, report that all threads are resolved and stop.

### 2. Research all findings

Investigate all comments and recommended changes across repository truth and external sources:

1. **Monorepo context.** Trace cited lines, surrounding logic, types, and all callers or dependents across packages.
2. **Repository documentation.** Verify recommendations against monorepo coding standards, testing guides, domain glossaries, and architecture decision records.
3. **External best practices.** For recommended patterns, alternative APIs, or library choices, conduct web research for primary specifications, release notes, and community consensus per [`../research/SKILL.md`](../research/SKILL.md).
4. **Counter-evidence and future breakages.** Check whether applying recommendations would cause subtle regressions, break public contracts, or create maintenance hazards.
5. **Classify findings:**
   - **Valid defect:** A verified bug, regression, or standard breach with proposed fix and test strategy.
   - **False positive:** An invalid claim contradicted by codebase implementation, tests, ADRs, or external specifications.
   - **Architectural trade-off:** Multiple valid approaches or scope questions requiring maintainer guidance.

### 3. Author report artifact

Author a markdown report artifact named `pr_<number>_comments_review.md` in the session artifact directory containing:
- Overview of inspected threads, authors, and files.
- Grouped findings by disposition with file citations, line numbers, and research proof.
- Technical refutations for false positives and exact proposed solutions for valid defects.

Present the artifact link and a summary table to the user.

Completion criterion: The review report artifact is written to the session artifact directory and presented to the user without modifying repository code or mutating GitHub threads.
