# 0002: Issue branching, milestone scope, and project status lifecycle

## Context

Managing issue status across both repository labels (`status:*`) and GitHub Projects (v2) fields created duplicate state, manual friction, and out-of-sync boards. Ad-hoc branch naming also prevented GitHub from establishing native issue-branch relationships and automations.

## Decision

1. **Native branching**: Create all ticket execution branches using `gh issue develop <ticket_number> --checkout`. GitHub assigns the standard `<number>-<slug>` name and registers the branch as a linked branch on the issue.
2. **Milestone scoping**: Assign milestones strictly to Specs to track capability releases without metric dilution. Child tickets do not receive milestones; their progress rolls up via native GitHub sub-issues.
3. **Single source of truth for status**: Eliminate all `status:*` labels from the repository. Status is tracked exclusively on the GitHub Project Board (`Todo`, `In Progress`, `In Review`, `Done`).
4. **Parent Spec status rollup**:
   - When any child ticket begins implementation (`In Progress`), its parent Spec moves to `In Progress`.
   - Parent Specs never move to `In Review` based on child ticket activity; they remain `In Progress` until all child tickets reach `Done` and are verified by the maintainer.
   - Atomic tickets transition across project states: from `Todo` to `In Progress` when a linked branch or draft pull request is created, to `In Review` when marked ready for review, and to `Done` when merged.

## Consequences

- Contributors and agents do not invent custom branch names or manage redundant `status:*` labels.
- Dual-state desynchronization between issues and project boards is eliminated.
- Milestone completion graphs reflect feature delivery accurately.
