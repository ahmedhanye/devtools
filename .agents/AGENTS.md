# Agent guidelines

## Context pointers

- **Issue tracker**: Follow `.agents/docs/issue-tracker.md` for `gh` commands, ticket hierarchy, claiming, and board status.
- **Git workflow**: Follow `CONTRIBUTING.md` for linked branches, Conventional Commits, and pull requests.
- **Domain terms**: Use `.agents/CONTEXT.md` (`Spec`, `Ticket`, `Frontier`, `DRI`).

## Execution boundaries

- **Contract-first tickets**: Define behavioral contracts and automated acceptance criteria in issues. Omit execution commands and branch names.
- **Observable verification**: Write acceptance criteria as checkable automated commands or observable behaviors (test runs, exit codes, HTTP status codes).
- **Ticket partitioning**: Stage and commit only the files belonging to the active ticket before branching for subsequent tickets.
- **Escalation**: When requirements are ambiguous or tests fail repeatedly, apply `needs-human-review`, post a blocker summary, and yield execution.
