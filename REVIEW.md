# Review and verification guide

Run the narrowest verification commands that prove modified files work. Skip unrelated suites, batch commands into compound one-liners, and avoid redundant executions.

## Compound execution protocol

Run related checks together using `&&` to catch errors early and keep feedback fast:

1. **Chain checks with `&&` in one command.** Run formatters, linters, typechecks, and test runners together instead of one by one.
2. **Fail fast.** Chaining with `&&` stops at the first failing check without waiting on downstream commands.
3. **Batch file paths.** Pass all modified files together as arguments rather than running a tool per file.

## Scope and verification matrix

Inspect changed files and run only the compound recipe matching the modified paths:

- **Iterative checks (during edits).** Apply to files modified in the working tree (`git status -s`), auto-formatting edited files before typechecking and testing.
- **Completion checks (before handoff or review).** Apply to all files changed across the cumulative branch diff against the base branch (`git diff --name-only <base-branch>`, defaulting to `origin/main` or the parent stack branch on stacked PRs).

| Changed paths                                           | Iterative check (during edits)                                                                                                                                           | Completion check (before handoff or review)                                                                                                                                                                                                                 |
| :------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/**`, root `*.md`                                  | `bunx prettier --write <files>`                                                                                                                                          | `bunx prettier --check --log-level warn <files>`                                                                                                                                                                                                            |
| `.agents/**`                                            | `bun run lint:agents <files> && bunx prettier --write <files>` (if `.agents/**/scripts/**` changed: `&& bunx oxlint --deny-warnings <files> && bun test ./<test-files>`) | `bun run lint:agents && bunx prettier --check --log-level warn .agents/` (if `.agents/**/scripts/**` tests exist: `&& bunx oxlint --deny-warnings .agents/ && bun test ./<test-files>`)                                                                     |
| `.github/workflows/**`, `.github/actions/**`, `**/*.sh` | `bun run lint:workflows`                                                                                                                                                 | `bun run lint:workflows`                                                                                                                                                                                                                                    |
| `scripts/**`                                            | `bunx oxlint --deny-warnings <files> && bunx prettier --write <files> && bun test <test-files>`                                                                          | `bunx oxlint --deny-warnings scripts/ && bunx prettier --check --log-level warn scripts/ && bun test scripts/`                                                                                                                                              |
| `packages/<pkg>/**`                                     | `bunx oxlint --deny-warnings <files> && bunx prettier --write <files> && bun --filter @devtools/<pkg> typecheck && bun test <test-files>`                                | `bun run fallow:dead-code && bun run fallow:arch && bun run test:coverage packages/<pkg> && bun run verify:diff-coverage`                                                                                                                                   |
| `apps/api/**`, `apps/cli/**`                            | `bunx oxlint --deny-warnings <files> && bunx prettier --write <files> && bun --filter @devtools/<app> typecheck && bun test <test-files>`                                | `bun run fallow:dead-code && bun run fallow:arch && bun run test:coverage apps/<app> && bun run verify:diff-coverage` (if CLI bin/bundling changed: `&& bun run smoke:bin`)                                                                                 |
| `apps/frontend/**`                                      | `bunx oxlint --deny-warnings <files> && bunx prettier --write <files> && bun --filter @devtools/frontend typecheck && bun --filter @devtools/frontend test <test-files>` | `bun run lint:fsd && CI=true bunx react-doctor --project apps/frontend --no-telemetry --no-supply-chain --blocking warning --scope changed && bun --filter @devtools/frontend build && bun run test:coverage apps/frontend && bun run verify:diff-coverage` |
| `site/content/**`                                       | `bunx prettier --write <files> && bun --filter @devtools/site typecheck`                                                                                                 | `bunx prettier --check --log-level warn site/content/ && bun --filter @devtools/site build`                                                                                                                                                                 |
| `site/src/**`, `site/tests/**`                          | `bunx oxlint --deny-warnings <files> && bunx prettier --write <files> && bun --filter @devtools/site typecheck && bun --filter @devtools/site test`                      | `CI=true bunx react-doctor --project site --no-telemetry --no-supply-chain --blocking warning --scope changed && bun --filter @devtools/site build && bun run test:coverage site && bun run verify:diff-coverage`                                           |
| Root configs or multi-workspace changes                 | Matching workspace iterative compound checks above (for scoped multi-workspace coverage: `bun run test:coverage --changed && bun run verify:diff-coverage`)              | `bun run verify`                                                                                                                                                                                                                                            |

## Deduplication and overlap prevention

> [!WARNING]
> Run only one `bun run test:coverage` process at a time, and do not run `bun run build:smoke` or `bun run test:e2e` concurrently with it. Both touch `./dist/devtools`; run `bun run smoke:bin` only after `test:coverage` finishes.

1. **Test runner and coverage deduplication.** `bun run test:coverage` compiles `./dist/devtools` (`bun run build:bin`), runs `scripts/collect-coverage/collect-coverage.ts` (including `bunx fumadocs-mdx` when `site` is targeted), executes Bun and `@devtools/frontend` Vitest coverage, and merges `coverage/lcov.info`. Pass a workspace target (`bun run test:coverage packages/<pkg>`) or `--changed` to run only modified targets while preserving sibling LCOV reports on merge; use bare `bun run test:coverage` or `bun run verify` for full sweeps. Omit redundant `bun test`, `bun run test:unit`, and extra `build:bin` invocations around `test:coverage`.
2. **Scope isolation.** For doc-only, rule-only, or workflow-only edits, stop after the matching completion check exits `0`. Do not run `bun run verify`, `bun run verify:fast`, or full test suites when no executable code changed. Run `bun run check:fix` to fix whole-repo lint and formatting issues in one pass.
3. **Diff coverage gate.** Workspace code changes require 100% diff coverage on modified executable lines via `bun run test:coverage <workspace> && bun run verify:diff-coverage` (or `--changed`) per [TESTING.md](TESTING.md#core-testing-philosophy-and-invariants). On stacked PR branches, pass `BASE_REF=<parent-branch> bun run verify:diff-coverage` (or `--base <parent-branch>`).
4. **Three-axis QA separation.** When running three-axis quality assurance, separate diagnostic-exit analyzers such as `fallow health` from required test or diff checks so downstream commands still run:
   - **White-box.** Static analyzers, unit suites, and `bun run test:coverage && bun run verify:diff-coverage` (owns compiling `./dist/devtools` inside `test:coverage`).
   - **Gray-box.** File-scoped `*.integration.test.ts` targets, `bun run fallow:arch`, `bun run fallow:security`, and `bun run lint:fsd`.
   - **Black-box.** Portable Stories (`*.stories.tsx`), exploratory source probes, and non-rebuilding end-to-end checks; run `bun run smoke:bin` after `test:coverage` finishes writing `./dist/devtools`.

## Commit gate and Git hooks

Pre-commit and commit-msg hooks in [lefthook.yml](lefthook.yml) run automatically on `git commit` (`oxlint --deny-warnings --fix`, `prettier --write`, `react-doctor --blocking warning --staged`, `@devtools/frontend` tests, `verify-staged-secrets.ts`, `verify-agents-governance.ts`, `verify:db-migrations`, and `commitlint`). Follow [Commits and atomic changes](docs/contributing/commits.md) rather than duplicating staged checks manually:

- **Bundle tests with their code.** Stage matching `*.test.*` and `tests/**` files in the same `feat`, `fix`, `refactor`, `perf`, or `chore` commit so every commit stays buildable; reserve `test:` for standalone test-only work.
- **Keep headers concise.** Commit subjects must stay at `72` characters or fewer (PR titles `<= 65` characters, `<= 64` at `#1000+`), with optional "why"-only bodies.
- **Mark fake test secrets explicitly.** Annotate intentional fake fixtures only with `// trufflehog:ignore` or `# trufflehog:ignore`.

## Fallow baselines

- **Fix new failures in code.** When `bun run fallow:health` or `bun run fallow:dupes` fails on new or edited code, simplify the function or extract shared logic instead of running `--save-baseline`.
- **Prune resolved debt only.** After refactoring existing findings tracked in [health-baseline.json](fallow-baselines/health-baseline.json) or [dupes-baseline.json](fallow-baselines/dupes-baseline.json), run `bunx fallow baselines prune --health-baseline fallow-baselines/health-baseline.json --dupes-baseline fallow-baselines/dupes-baseline.json` so fixed entries drop without adding new ones.
- **Keep identity matches stable.** Because `fallow:health` tracks findings by file path and function name, simplify any baselined function that you rename or move instead of re-adding it under a new name.
