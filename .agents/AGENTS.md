# Agent guidelines

## Context pointers

- **Issue tracker**: Follow `.agents/docs/issue-tracker.md` for `gh` commands, ticket hierarchy, claiming, and board status.
- **Git workflow**: Follow `CONTRIBUTING.md` for linked branches, Conventional Commits, and pull requests.
- **Domain terms**: Use `.agents/CONTEXT.md` for project vocabulary and system nouns (`Daemon`, `Runtime Stack`, `Spec`, `Ticket`, `Frontier`, `DRI`).
- **Architecture decisions**: Consult `.agents/docs/adr/` for recorded architectural decisions.

## Execution boundaries

- **Rule discovery**: Rule files in `.agents/rules/*.md` trigger automatically based on frontmatter glob patterns.
- **Architecture decision record (ADR) threshold**: Create an ADR in `.agents/docs/adr/` strictly for system software choices that alter runtime execution, data persistence, or network boundaries.
  The decision must satisfy three criteria: high reversal cost, non-obvious rationale, and a trade-off between viable technical designs.
  If the running software does not execute differently because of the choice, it is not an ADR.
  Route git workflows to `CONTRIBUTING.md`, tracker procedures to `.agents/docs/issue-tracker.md`, and dev tooling to configs.
- **Problem-first planning**: Before asking decision questions during planning or grilling, state the concrete technical failure mode and verify patterns against primary documentation or code.
- **Contract-first tickets**: Define behavioral contracts and automated acceptance criteria in issues. Keep implementation recipes and branch names in code and PRs.
- **Observable verification**: Write acceptance criteria as checkable automated commands or observable behaviors (test runs, exit codes, HTTP status codes).
- **Ticket partitioning**: Stage only the files belonging to the active ticket before branching for subsequent tickets.
- **Working artifact storage**: Save temporary scripts, research spikes, and session handoffs strictly in `.scratch/` (`.scratch/handoffs/`, `.scratch/research/`).
- **Instruction hygiene**: Follow `.agents/skills/unslop` and `.agents/skills/writing-for-agents` whenever creating or editing instructions, rules, or documentation in `.agents/`.
- **Git checkpoint**: Require explicit user confirmation before executing `git commit`, `git push`, or opening pull requests. Present `git status` and a compact summary (`git diff --stat`) for review.
- **Immutable locked skills**: Treat all skills declared in `skills-lock.json` (`.agents/skills/*`) as vendor-managed, read-only assets.
- **Escalation**: When requirements are ambiguous or tests fail repeatedly, apply `needs-human-review`, post a blocker summary, and yield execution.
- **Package manager & runner**: Execute all commands, package installations, and script runs with `bun` and `bunx`.
