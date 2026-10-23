---
trigger: "{apps/**,packages/**,site/**,scripts/**,.github/**,package.json,bun.lock}"
description: Change-scoped verification commands and quality checks for modified files.
---

# Verification rules

Rules for selecting verification commands tailored to changed files and enforcing verification parity.

## Verification tiers

Follow verification tiers before committing, pushing, or requesting review:

1. **Pre-commit staged checks (<1s):**
   Executed automatically by Lefthook `pre-commit` across staged files. Runs Oxlint autofixes, Prettier formatting, `react-doctor --staged`, and staged secret checks.
2. **Fast verification gate (<5s):**
   ```bash
   bun run verify:fast
   ```
   Runs Oxlint, Prettier check, workspace typechecks, Fallow dead-code analysis, and agent rule verification (bun run lint:agents) across the monorepo.
3. **Workspace test run:**
   ```bash
   bun --filter @devtools/<package> test
   ```
   Runs targeted tests during iterative development and TDD cycles.
4. **Canonical local verification gate (on-demand & pre-PR):**
   ```bash
   bun run verify
   ```
   Runs `bun run verify:fast && bun run lint:design && bun run lint:fsd && bun run fallow:dupes && bun run test:coverage && bun run verify:diff-coverage && bun run audit && bun run build:smoke && bun run lint:workflows`.
   Executed on-demand locally. Pull-request CI runs applicable verification checks in separate conditional jobs.
   **Mandatory requirement**: Agents must execute `bun run verify` with exit code 0 after completing an implementation plan or before completing `/code-review`.

## Scope-based verification

During iterative development, run verification commands matching modified files to stay fast:

1. **Determine changed files** using `git status --short` or `git diff --name-only main`.
2. **Execute matching scoped commands**. All scoped checks must pass with exit code 0.
3. **Run `bun run verify` for cross-cutting changes**: Run the full verification suite whenever changes modify root configurations (`package.json`, `bun.lock`, `tsconfig*.json`, `bunfig.toml`, `lefthook.yml`, `.oxlintrc.json`, `.fallowrc.json`), cross-package contracts, touch multiple workspaces simultaneously, or prior to finalizing work.

## Verification matrix

| Changed files                                | Scope                 | Commands                                                                                                                                                                                                                                                                |
| -------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/**`, `.github/actions/**` | Workflow validation   | `bun run lint:workflows`<br>`bun scripts/verify-staged-secrets.ts` (after staging)                                                                                                                                                                                      |
| `apps/<pkg>/**`                              | Application workspace | `bunx oxlint apps/<pkg>/**`<br>`bunx prettier --check apps/<pkg>/**`<br>`bun --filter @devtools/<pkg> typecheck`<br>`bun --filter @devtools/<pkg> test`<br>(For frontend: `bun --filter @devtools/frontend lint:design` and `bun --filter @devtools/frontend lint:fsd`) |
| `packages/<pkg>/**`                          | Package workspace     | `bunx oxlint packages/<pkg>/**`<br>`bunx prettier --check packages/<pkg>/**`<br>`bun --filter @devtools/<pkg> typecheck`<br>`bun --filter @devtools/<pkg> test`                                                                                                         |
| `site/content/**`                            | Documentation content | `bunx prettier --check site/content/**`<br>`bun --filter @devtools/site typecheck`<br>`bun --filter @devtools/site build`                                                                                                                                               |
| `site/**` (site application code)            | Site workspace        | `bunx oxlint site/src/**`<br>`bunx prettier --check site/**`<br>`bun --filter @devtools/site typecheck`<br>`bun --filter @devtools/site test`<br>`bun --filter @devtools/site build`                                                                                    |
| `scripts/**`                                 | Internal scripts      | `bunx oxlint scripts/`<br>`bunx prettier --check scripts/`<br>`bun test scripts/`                                                                                                                                                                                       |
| `.agents/**`, repository docs (`*.md`)       | Docs and guidelines   | `bun run lint:agents`<br>`bunx prettier --check .agents/** *.md`                                                                                                                                                                                                        |
| Cross-cutting changes / pre-PR review        | Full verification     | `bun run verify`                                                                                                                                                                                                                                                        |

## Quality guardrails

To prevent regressions and recurring review findings:

- **Exit codes in business logic:** Command handlers and library functions must return numeric exit codes (`Promise<number>`) or throw typed errors. Use Commander's `.exitOverride()` so CLI parsing errors are testable without killing the test runner.
- **Isolate host environment in unit tests:** Accept filesystem and execution seams rather than probing host binaries or ambient filesystem state directly.
- **Platform seams:** Code branching on `platform()` or OS-specific paths must accept a seam (e.g., `seam?: { platform?: () => string }`) to allow deterministic verification on any runner.
