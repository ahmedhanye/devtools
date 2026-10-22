---
trigger:
  - "**"
description: Change-scoped verification commands and quality checks for modified files.
---

# Verification rules

Rules for selecting verification commands tailored to changed files and enforcing verification parity.

## The Verification Ladder

Agents and developers must follow the verification ladder before committing, pushing, or requesting review:

1. **Pre-Commit Staged Quality Gate (<1s)**:
   Executed automatically by Lefthook `pre-commit` across staged files. Auto-fixes Oxlint lint rules, formats code and docs with Prettier, validates React quality with `react-doctor --staged`, and checks staged secrets without whole-repo overhead.
2. **Fast Verification Gate (<5s)**:
   ```bash
   bun run verify:fast
   ```
   Runs Oxlint, Prettier check, workspace typechecks, and Fallow dead-code analysis across the entire repository. Used for rapid feedback during iterative coding.
3. **Workspace Test Run**:
   ```bash
   bun --filter <package-name> test
   ```
   Runs targeted tests during iterative development and TDD red-green cycles.
4. **Canonical Local Verification Gate (On-Demand & Pre-PR)**:
   ```bash
   bun run verify
   ```
   Runs `bun run verify:fast && bun run lint:design && bun run lint:fsd && bun run fallow:dupes && bun run test:coverage && bun run verify:diff-coverage && bun run audit && bun run build:smoke && bun run lint:workflows`.
   Executed on-demand locally. Pull-request CI runs applicable verification checks in separate conditional jobs.
   **Mandatory requirement**: Agents must execute `bun run verify` with exit code 0 after completing an implementation plan or before completing `/code-review`.

## Scope-based verification

During iterative development, run verification commands matching modified files to stay fast:

1. **Determine changed files** using `git status --short` or `git diff --name-only main`.
2. **Execute the matching scoped commands**. All scoped checks must pass with exit code 0.
3. **Mandate `bun run verify` for cross-cutting changes and final review**: Run the full verification suite whenever changes modify root configurations (`package.json`, `bun.lock`, `tsconfig*.json`, `bunfig.toml`, `lefthook.yml`, `.oxlintrc.json`, `.fallowrc.json`), cross-package contracts, touch multiple workspaces simultaneously, or prior to finalizing work.

## Verification matrix

| Changed files                                | Scope                 | Commands                                                                                                                                                                                                                                                                |
| -------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/**`, `.github/actions/**` | Workflow validation   | `bun run lint:workflows`<br>`bun scripts/verify-staged-secrets.ts` (after staging)                                                                                                                                                                                      |
| `apps/<pkg>/**`                              | Application workspace | `bunx oxlint apps/<pkg>/**`<br>`bunx prettier --check apps/<pkg>/**`<br>`bun --filter @devtools/<pkg> typecheck`<br>`bun --filter @devtools/<pkg> test`<br>(For frontend: `bun --filter @devtools/frontend lint:design` and `bun --filter @devtools/frontend lint:fsd`) |
| `packages/<pkg>/**`                          | Package workspace     | `bunx oxlint packages/<pkg>/**`<br>`bunx prettier --check packages/<pkg>/**`<br>`bun --filter @devtools/<pkg> typecheck`<br>`bun --filter @devtools/<pkg> test`                                                                                                         |
| `site/content/**`                            | Documentation content | `bunx prettier --check site/content/**`<br>`bun --filter @devtools/site typecheck`<br>`bun --filter @devtools/site build`                                                                                                                                               |
| `site/**` (site application code)            | Site workspace        | `bunx oxlint site/src/**`<br>`bunx prettier --check site/**`<br>`bun --filter @devtools/site typecheck`<br>`bun --filter @devtools/site test`<br>`bun --filter @devtools/site build`                                                                                    |
| `scripts/**`                                 | Internal scripts      | `bunx oxlint scripts/`<br>`bunx prettier --check scripts/`<br>`bun test scripts/`                                                                                                                                                                                       |
| `.agents/**`, repository docs (`*.md`)       | Docs and guidelines   | `bunx prettier --check .agents/** *.md`                                                                                                                                                                                                                                 |
| Cross-cutting changes / pre-PR review        | Full verification     | `bun run verify`                                                                                                                                                                                                                                                        |

## Agent Quality Guardrails

To prevent regressions and recurring review findings:

- **No `process.exit()` in business logic**: Command handlers and library functions must return numeric exit codes (`Promise<number>`) or throw typed errors. Use Commander's `.exitOverride()` so CLI parsing errors are testable without killing the test runner.
- **Isolate host environment in unit tests**: Do not probe host binaries or ambient filesystem state without mock seams.
- **Platform seams**: Code branching on `platform()` or OS-specific paths must accept a seam (e.g., `seam?: { platform?: () => string }`) to allow deterministic verification on any runner.
