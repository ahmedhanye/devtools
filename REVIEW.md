# Review and Verification Guide

Run the narrowest verification commands that prove modified files work. Skip unrelated suites, batch commands into compound one-liners, and avoid redundant executions.

## Compound execution protocol

To minimize token usage and turn latency:

1. **Always chain checks with `&&` in a single command invocation.** Never run individual formatters, linters, and test runners across separate sequential turns.
2. **Fail fast.** Chaining with `&&` halts execution at the first failing check, immediately highlighting the error without wasting turns on downstream checks.
3. **Batch file paths.** Pass all modified files together as arguments rather than running a tool per file.

## Scope and verification matrix

Inspect changed files (`git status -s` or `git diff --name-only origin/main`) and run only the compound recipe matching the modified paths:

| Changed paths                                           | Iterative check (during edits)                                                                                                                                           | Completion check (before handoff or review)                                                                                                                                                                                                              |
| :------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/**`, root `*.md`                                  | `bunx prettier --check <files>`                                                                                                                                          | `bunx prettier --check <files>`                                                                                                                                                                                                                          |
| `.agents/**`                                            | `bun scripts/verify-agents-governance/verify-agents-governance.ts <files> && bunx prettier --check <files>`                                                              | `bun run lint:agents && bunx prettier --check <files>`                                                                                                                                                                                                   |
| `.github/workflows/**`, `.github/actions/**`, `**/*.sh` | `bun run lint:workflows`                                                                                                                                                 | `bun run lint:workflows`                                                                                                                                                                                                                                 |
| `scripts/**`                                            | `bunx oxlint --deny-warnings <files> && bunx prettier --check <files> && bun test <test-files>`                                                                          | `bunx oxlint --deny-warnings scripts/ && bunx prettier --check scripts/ && bun test scripts/`                                                                                                                                                            |
| `packages/<pkg>/**`                                     | `bunx oxlint --deny-warnings <files> && bunx prettier --check <files> && bun --filter @devtools/<pkg> typecheck && bun test <test-files>`                                | `bun --filter @devtools/<pkg> test && bun run fallow:dead-code && bun run fallow:arch && bun run test:coverage && bun run verify:diff-coverage`                                                                                                          |
| `apps/api/**`, `apps/cli/**`                            | `bunx oxlint --deny-warnings <files> && bunx prettier --check <files> && bun --filter @devtools/<pkg> typecheck && bun test <test-files>`                                | `bun --filter @devtools/<pkg> test && bun run fallow:dead-code && bun run fallow:arch && bun run test:coverage && bun run verify:diff-coverage` (if CLI bin/bundling changed: `&& bun run build:smoke`)                                                  |
| `apps/frontend/**`                                      | `bunx oxlint --deny-warnings <files> && bunx prettier --check <files> && bun --filter @devtools/frontend typecheck && bun --filter @devtools/frontend test <test-files>` | `bun --filter @devtools/frontend test && bun run lint:fsd && bun run lint:design && CI=true bunx react-doctor --project apps/frontend --scope changed && bun --filter @devtools/frontend build && bun run test:coverage && bun run verify:diff-coverage` |
| `site/content/**`                                       | `bunx prettier --check <files> && bun --filter @devtools/site typecheck`                                                                                                 | `bun --filter @devtools/site build`                                                                                                                                                                                                                      |
| `site/src/**`, `site/tests/**`                          | `bunx oxlint --deny-warnings <files> && bunx prettier --check <files> && bun --filter @devtools/site typecheck && bun --filter @devtools/site test`                      | `CI=true bunx react-doctor --project site --scope changed && bun --filter @devtools/site build && bun run test:coverage && bun run verify:diff-coverage`                                                                                                 |
| Root configs or multi-workspace changes                 | Matching workspace iterative compound checks above                                                                                                                       | `bun run verify`                                                                                                                                                                                                                                         |

## Deduplication and overlap prevention

1. **Test runner deduplication.** `bun run test:coverage` builds `./dist/devtools` (`bun run build:bin`) and executes all Bun workspace suites (`unit`, `integration`, `e2e`) alongside `@devtools/frontend` Vitest coverage. Omit redundant `bun test`, `bun run test:unit`, and workspace-wide integration or E2E sweeps when running `test:coverage`, and avoid concurrent `bun run build:smoke` runs that overwrite `./dist/devtools`.
2. **Scope isolation.** For doc-only, rule-only, or workflow-only edits, halt after the matching completion check exits `0`. Do not run `bun run verify`, `bun run verify:fast`, or full test suites when no executable application code changed.
3. **Diff coverage gate.** Single-workspace code changes require 100% diff coverage on modified executable lines via `bun run test:coverage && bun run verify:diff-coverage` before handoff or PR creation per [TESTING.md](TESTING.md#core-testing-philosophy-and-invariants). The verifier accounts for tracked modifications and untracked new source files against the merge base.
4. **Compound QA execution.** Each QA axis subagent selectively reads [TESTING.md](TESTING.md#test-level-separation-and-file-naming) and workspace manifests for its own axis rather than relying on coordinator pre-mapping, launching static analyzers and test runners in compound commands (separating diagnostic-exit analyzers such as `fallow health` so downstream diff or test checks still run):
   - **White-box.** Static analyzers, unit suites, and `test:coverage && verify:diff-coverage`.
   - **Gray-box.** File-scoped `*.integration.test.ts` targets, `fallow:arch`, `fallow:security`, and `lint:fsd`.
   - **Black-box.** `*.e2e.test.ts`, `*.stories.tsx`, and `build:smoke` without overwriting `./dist/devtools` concurrently with `test:coverage`.

## Pre-commit and staged gate

After staging changes with `git add`, verify security in a single command before committing:

```bash
bun scripts/verify-staged-secrets/verify-staged-secrets.ts
```

Confirm no unignored secrets (`// trufflehog:ignore` or `# trufflehog:ignore`) are staged. Atomic commit boundaries and message formatting are validated automatically on `git commit` via Lefthook's `commit-msg` hook (`bunx commitlint` and `verify-atomic-commit.ts`).
