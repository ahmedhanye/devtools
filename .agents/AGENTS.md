# Agent guidelines

## Context pointers

- **Git workflow and issues.** Read `CONTRIBUTING.md` when managing branches, pull requests, commits, and GitHub issues.
- **Domain vocabulary.** Read `GLOSSARY-MAP.md` for bounded context glossaries under `docs/glossary/` and naming constraints.
- **Architecture decision records.** Consult `docs/adr/` before changing runtime execution, persistence, or network boundaries.
- **Documentation site architecture.** Read `docs/site-architecture.md` when modifying Fumadocs routing, MDX configurations, search APIs, or LLM endpoints.

## Execution boundaries

- **Problem-first planning.** State concrete technical failure modes and verify patterns against documentation or code before asking decision questions.
- **Contract-first tickets.** Define behavioral contracts and automated acceptance criteria in issues. Keep implementation recipes and branch names in code and pull requests.
- **Ticket partitioning.** Stage only files belonging to the active ticket before branching for subsequent tickets.
- **Phase checkpoints.** Pause and obtain user confirmation after completing research, code review, or planning before modifying codebase files or staging changes.
- **Reactive background execution.** Await reactive system completion notifications for background tasks. Yield execution immediately without polling status loops or sleep commands.
- **Instruction hygiene.** Follow `.agents/skills/unslop` and `.agents/skills/writing-for-agents` when creating or editing instructions, rules, or documentation in `.agents/`.
- **Path portability.** Use repository-relative paths for all tracked codebase files, documentation, git commit messages, and symbol references. Never commit absolute machine paths. Absolute filesystem paths and `file://` URIs are strictly restricted to ephemeral local session artifacts, transcripts, and temporary analysis files under `.scratch/` for IDE navigability.
- **Secret handling.** Never write sensitive data or credentials into the repository. Store runtime secrets in gitignored `.env` files. Use the file's comment syntax: append `// trufflehog:ignore` in `//`-comment files or `# trufflehog:ignore` in `#`-comment files, and only when a test fixture is completely fake.
- **Git checkpoint.** Require explicit user confirmation before executing `git commit`, `git push`, branch merges, opening pull requests, or mutating stacks (`gh stack push`, `gh stack submit`, `gh stack merge`), unless the user explicitly requested the action in their prompt or authorized autonomous execution. When pausing for confirmation, present `git status` alongside staged (`git diff --cached --stat`) and unstaged (`git diff --stat`) changes for review.
- **Two-tier skill management.** Treat skills declared in `skills-lock.json` as vendor-managed, read-only assets updated through `bunx skills`. Eject customized skills into `.agents/skills-override.json` to shield them from CLI overwrites, and reconcile updates with `/update-custom-skills`.
- **Package manager and runner.** Use `bun` and `bunx` for package installations and package scripts. Translate `npm`, `npx`, or `pnpm` references to their `bun` equivalents or workspace scripts.
