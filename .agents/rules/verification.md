---
trigger:
  - "**"
description: Change-scoped verification commands and quality checks for modified files.
---

# Verification rules

Rules for selecting verification commands tailored to changed files.

## Scope-based verification

Run only the verification commands that match modified files. Reserve `bun run verify` for cross-cutting changes.

1. **Determine changed files** using `git status --short` or `git diff --name-only main`.
2. **Execute the matching scoped commands**. All scoped checks must pass with exit code 0.
3. **Reserve `bun run verify` for cross-cutting changes**: Run the full verification suite only when changes modify root configurations (`package.json`, `bun.lock`, `tsconfig.json`, `bunfig.toml`, `lefthook.yml`), cross-package contracts, or touch multiple workspaces simultaneously.

## Verification matrix

| Changed files                                | Scope                 | Commands                                                                                                                                                                                                                                                                |
| -------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/**`, `.github/actions/**` | Workflow validation   | `bunx prettier --check .github/workflows/** .github/actions/**`<br>`bun scripts/verify-staged-secrets.ts` (after staging)                                                                                                                                               |
| `apps/<pkg>/**`                              | Application workspace | `bunx oxlint apps/<pkg>/**`<br>`bunx prettier --check apps/<pkg>/**`<br>`bun --filter @devtools/<pkg> typecheck`<br>`bun --filter @devtools/<pkg> test`<br>(For frontend: `bun --filter @devtools/frontend lint:design` and `bun --filter @devtools/frontend lint:fsd`) |
| `packages/<pkg>/**`                          | Package workspace     | `bunx oxlint packages/<pkg>/**`<br>`bunx prettier --check packages/<pkg>/**`<br>`bun --filter @devtools/<pkg> typecheck`<br>`bun --filter @devtools/<pkg> test`                                                                                                         |
| `site/content/**`                            | Documentation content | `bunx prettier --check site/content/**`<br>`bun --filter @devtools/site typecheck`<br>`bun --filter @devtools/site build`                                                                                                                                               |
| `site/**` (site application code)            | Site workspace        | `bunx oxlint site/src/**`<br>`bunx prettier --check site/**`<br>`bun --filter @devtools/site typecheck`<br>`bun --filter @devtools/site test`<br>`bun --filter @devtools/site build`                                                                                    |
| `scripts/**`                                 | Internal scripts      | `bunx oxlint scripts/`<br>`bunx prettier --check scripts/`<br>`bun test scripts/`                                                                                                                                                                                       |
| `.agents/**`, repository docs (`*.md`)       | Docs and guidelines   | `bunx prettier --check .agents/** *.md`                                                                                                                                                                                                                                 |
| Cross-cutting changes / root configs         | Full verification     | `bun run verify`                                                                                                                                                                                                                                                        |
