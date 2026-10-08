# Agent guidelines

## Context pointers

- **Issue tracking and board operations**: Read `.agents/docs/issue-tracker.md` for `gh` CLI commands, ticket hierarchy, claiming, and board status.
- **Git workflow and pull requests**: Read `CONTRIBUTING.md` for linked branches, Conventional Commits, and pull requests.
- **Domain vocabulary**: Read `.agents/GLOSSARY.md` for system nouns (`Daemon`, `Runtime Stack`, `Spec`, `Ticket`, `Frontier`, `DRI`).
- **Architecture decision records**: Consult `.agents/docs/adr/` when evaluating system software choices that alter runtime execution, data persistence, or network boundaries.

## Execution boundaries

- **Rule discovery**: Rule files in `.agents/rules/*.md` trigger automatically based on frontmatter glob patterns.
- **Architecture decision record (ADR) threshold**: Create an ADR in `.agents/docs/adr/` strictly for system software choices that alter runtime execution, data persistence, or network boundaries.
  The decision must satisfy three criteria: high reversal cost, non-obvious rationale, and a trade-off between viable technical designs.
  If the running software does not execute differently because of the choice, it is not an ADR.
  Route git workflows to `CONTRIBUTING.md`, tracker procedures to `.agents/docs/issue-tracker.md`, and dev tooling to configs.
- **Problem-first planning**: Before asking decision questions during planning or grilling, state the concrete technical failure mode and verify patterns against primary documentation or code.
- **Contract-first tickets**: Define behavioral contracts and automated acceptance criteria in issues. Keep implementation recipes and branch names in code and PRs.
- **Ticket partitioning**: Stage only the files belonging to the active ticket before branching for subsequent tickets.
- **Working artifact storage**: Save ephemeral files strictly in workspace `tmp/` partitioned by purpose: temporary scripts in `tmp/scripts/`, research spikes in `tmp/research/`, session handoffs in `tmp/handoff/`, and issue drafts in `tmp/issues/`. Workspace `tmp/` storage rules strictly supersede vendor skill paths; isolate all ephemeral files within workspace `tmp/`. Save compiled standalone executables strictly in repository root `dist/`. Pull request descriptions cite only permanent codebase paths.
- **Reactive background execution**: Await reactive system completion notifications for background tasks. Yield execution immediately without polling status loops or sleep commands.
- **Instruction hygiene**: Follow `.agents/skills/unslop` and `.agents/skills/writing-for-agents` whenever creating or editing instructions, rules, or documentation in `.agents/`.
- **Path portability**: Reference files, code symbols, and documentation exclusively using repository-relative paths. Never embed or commit absolute machine paths (such as `/home/...` or `file:///...`).
- **Git checkpoint**: Require explicit user confirmation before executing `git commit`, `git push`, or opening pull requests. Present `git status` and a compact summary (`git diff --stat`) for review.
- **Immutable locked skills**: Treat skills declared in `skills-lock.json` (`.agents/skills/*`) as vendor-managed, read-only assets. Update them exclusively through `bunx skills`.
- **Escalation**: When requirements are ambiguous or tests fail repeatedly, apply `needs-human-review`, post a blocker summary, and yield execution.
- **Package manager and runner**: Execute all commands, package installations, and script runs with `bun` and `bunx`.
