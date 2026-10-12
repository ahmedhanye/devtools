# Agent guidelines

## Context pointers

- **Issue tracking and board operations**: Read `.agents/docs/issue-tracker.md` for `gh` CLI commands, ticket hierarchy, claiming, and board status.
- **Git workflow and pull requests**: Read `CONTRIBUTING.md` for linked branches, Conventional Commits, and pull requests.
- **Domain vocabulary**: Read `.agents/GLOSSARY.md` for system nouns (`Daemon`, `Runtime Stack`, `Spec`, `Ticket`, `Frontier`, `DRI`).
- **Architecture decision records**: Consult `.agents/docs/adr/` when evaluating system software choices that alter runtime execution, data persistence, or network boundaries.
- **Documentation platform architecture**: Read `.agents/docs/site-architecture.md` for Fumadocs routing, search APIs, LLM endpoints, and MDX configurations.
- **Testing standards and contracts**: Read `.agents/docs/testing.md` for contract seams, testing anti-patterns, and workspace testing blueprints.

## Execution boundaries

- **Rule discovery**: Rule files in `.agents/rules/*.md` trigger automatically based on frontmatter glob patterns.
- **Architecture decision record (ADR) threshold**: Create an ADR in `.agents/docs/adr/` strictly for system software choices that alter runtime execution, data persistence, or network boundaries.
  The decision must satisfy three criteria: high reversal cost, non-obvious rationale, and a trade-off between viable technical designs.
  If the running software does not execute differently because of the choice, it is not an ADR.
  Route git workflows to `CONTRIBUTING.md`, tracker procedures to `.agents/docs/issue-tracker.md`, and dev tooling to configs.
- **Grilling action-bias gate**: Whenever `/grill-me` or `/grill-with-docs` is invoked, agents are strictly prohibited from mutating repository code, tests, or configurations, or executing mutative commands, until all interview rounds conclude and the user confirms alignment. Only working notes and handoff artifacts in `.scratch/` may be authored during the interview.
- **Problem-first planning**: Before asking decision questions during planning or grilling, state the concrete technical failure mode and verify patterns against primary documentation or code.
- **Contract-first tickets**: Define behavioral contracts and automated acceptance criteria in issues. Keep implementation recipes and branch names in code and PRs.
- **Autonomous test seams**: Proceed test-first without interactive confirmation modals (`ask_question`) when seams directly implement ticket acceptance criteria. Do not pause execution to pre-agree seams unless requirements are ambiguous or specify competing architectural designs.
- **Prohibition of content testing**: Never write tests that assert static copy, prose strings, styling classes, page inventory counts, or trivial variable equality. Reserve automated tests strictly for runtime behavior, contracts, data schemas, and error boundaries.
- **Ticket partitioning**: Stage only the files belonging to the active ticket before branching for subsequent tickets.
- **Working artifact storage**: Ephemeral files live strictly in workspace `.scratch/` partitioned by purpose. Consult `.agents/rules/storage.md` for partition routing, host `/tmp` prohibition, and UI panel session mirroring.
- **Reactive background execution**: Await reactive system completion notifications for background tasks. Yield execution immediately without polling status loops or sleep commands.
- **Instruction hygiene**: Follow `.agents/skills/unslop` and `.agents/skills/writing-for-agents` whenever creating or editing instructions, rules, or documentation in `.agents/`.
- **Path portability**: Reference files, code symbols, and documentation exclusively using repository-relative paths. Never embed or commit absolute machine paths (such as `/home/...` or `file:///...`).
- **Git checkpoint**: Require explicit user confirmation before executing `git commit`, `git push`, or opening pull requests. Present `git status` and a compact summary (`git diff --stat`) for review.
- **Immutable locked skills**: Treat skills declared in `skills-lock.json` (`.agents/skills/*`) as vendor-managed, read-only assets. Update them exclusively through `bunx skills`.
- **Escalation**: When requirements are ambiguous or tests fail repeatedly, apply `needs-human-review`, post a blocker summary, and yield execution.
- **Package manager and runner**: Execute all commands, package installations, and script runs with `bun` and `bunx`.
