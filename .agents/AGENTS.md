# Agent guidelines

## Context

- **Documentation.** Always read the relevant guide before acting: `TESTING.md` for tests, `CODING_STANDARDS.md` for code and APIs, `REVIEW.md` for verification and diffs, `ARCHITECTURE.md` for system design, `CONTRIBUTING.md` for git, issue, and PR workflows, and `GLOSSARY-MAP.md` and `docs/adr/` for domain terms and architecture decisions.

## Execution boundaries

- **Reactive background execution.** Never poll running background commands, child tasks, or subagents. The moment an asynchronous process or subagent is dispatched, yield execution immediately: output a brief user-facing progress note and end the turn with zero tool calls. Do not invoke status, list, polling, or sleep tools (such as `manage_subagents`, `manage_task`, or shell sleep loops) to wait for completion. Await the environment's reactive completion or message notification. When a command's output is truncated and saved to a log file, read the saved output file rather than re-running the command.
- **Non-interactive execution.** Execute CLI commands, package runners, and tool invocations with non-interactive flags (`--yes`, `-y`, `--no-interactive`), and suppress terminal pagers with `PAGER=cat` or `--no-pager`. Never invoke commands that prompt for TTY user input in background tasks.
- **Path portability.** Use repository-relative paths for all tracked codebase files, documentation, git commit messages, and symbol references. Never commit absolute machine paths or `file://` URIs in tracked repository files or shell commands. Restrict absolute filesystem paths and clickable `file://` links strictly to agent chat responses, ephemeral local session artifacts, transcripts, and temporary analysis files under `.scratch/` for IDE navigability.
- **Temporary file hygiene.** Write to `.scratch/` only when explicitly designated. Keep ad-hoc scripts and temporary files inside the agent session scratch directory or run inline commands without leaving untracked files.
- **Secret handling.** Never write sensitive data or credentials into the repository. Store runtime secrets in gitignored `.env` files. Append `// trufflehog:ignore` in `//`-comment files or `# trufflehog:ignore` in `#`-comment files, and only when a test fixture is completely fake.
- **Git write boundaries.** Only run `git commit`, `git push`, branch merges, PR creation, or stack mutations when requested by the user or an invoked git workflow, and execute them directly without asking for confirmation again. Ask before destructive or force operations (such as `git push --force`, `git reset --hard`, or branch deletion).
- **Package manager and runner.** Use `bun` and `bunx` for package installations and package scripts. Translate `npm`, `npx`, or `pnpm` references to their `bun` equivalents or workspace scripts.
