---
trigger: "**"
description: Smart CLI verification commands and completion gates for agents modifying repository files.
---

# Review and verification rules

Run the narrowest verification commands that prove modified files work. Skip unrelated suites.

## Scope matrix

Inspect changed files (`git status --short` or `git diff --name-only origin/main`) and run only the checks matching the modified paths:

| Changed paths                                           | Iterative checks (during edits)                                                                                                                                           | Completion checks (before handoff or review)                                                                                                                                                            |
| :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/**`, root `*.md`                                  | `bunx prettier --check <files>`                                                                                                                                           | `bunx prettier --check <files>`                                                                                                                                                                         |
| `.agents/**`                                            | `bun scripts/verify-agents-governance.ts <files>`<br>`bunx prettier --check <files>`                                                                                      | `bun run lint:agents`<br>`bunx prettier --check <files>`                                                                                                                                                |
| `.github/workflows/**`, `.github/actions/**`, `**/*.sh` | `bun run lint:workflows`                                                                                                                                                  | `bun run lint:workflows`                                                                                                                                                                                |
| `scripts/**`                                            | `bunx oxlint --deny-warnings <files>`<br>`bunx prettier --check <files>`<br>`bun test <test-files>`                                                                       | `bunx oxlint --deny-warnings scripts/`<br>`bunx prettier --check scripts/`<br>`bun test scripts/`                                                                                                       |
| `packages/<pkg>/**`                                     | `bunx oxlint --deny-warnings <files>`<br>`bunx prettier --check <files>`<br>`bun --filter @devtools/<pkg> typecheck`<br>`bun test <test-files>`                           | `bun --filter @devtools/<pkg> test`<br>`bun run fallow:dead-code`<br>`bun run fallow:arch`                                                                                                              |
| `apps/api/**`, `apps/cli/**`                            | `bunx oxlint --deny-warnings <files>`<br>`bunx prettier --check <files>`<br>`bun --filter @devtools/<pkg> typecheck`<br>`bun test <test-files>`                           | `bun --filter @devtools/<pkg> test`<br>`bun run fallow:dead-code`<br>`bun run fallow:arch`<br>(If CLI bin/bundling changed: `bun run build:smoke`)                                                      |
| `apps/frontend/**`                                      | `bunx oxlint --deny-warnings <files>`<br>`bunx prettier --check <files>`<br>`bun --filter @devtools/frontend typecheck`<br>`bun --filter @devtools/frontend test <files>` | `bun --filter @devtools/frontend test`<br>`bun run lint:fsd`<br>`bun run lint:design`<br>`CI=true bunx react-doctor --project apps/frontend --scope changed`<br>`bun --filter @devtools/frontend build` |
| `site/content/**`                                       | `bunx prettier --check <files>`<br>`bun --filter @devtools/site typecheck`                                                                                                | `bun --filter @devtools/site build`                                                                                                                                                                     |
| `site/src/**`, `site/tests/**`                          | `bunx oxlint --deny-warnings <files>`<br>`bunx prettier --check <files>`<br>`bun --filter @devtools/site typecheck`<br>`bun --filter @devtools/site test`                 | `CI=true bunx react-doctor --project site --scope changed`<br>`bun --filter @devtools/site build`                                                                                                       |
| Root configs or multi-workspace changes                 | Matching workspace iterative checks above                                                                                                                                 | `bun run verify`                                                                                                                                                                                        |

## Gate selection rules

1. **Docs, rules, or workflow-only changes.** Stop after the row's completion checks exit `0`; skip `bun run verify`, `bun run verify:fast`, and test suites when no executable code changed.
2. **Single-workspace code changes.** Run the row's iterative checks while editing, then run the row's completion checks plus `bun run test:coverage && bun run verify:diff-coverage`.
3. **Cross-cutting code changes.** Run `bun run verify` once as the final pre-review gate after all edits are complete.
4. **Staged secrets check.** After `git add`, run `bun scripts/verify-staged-secrets.ts` to confirm no credentials or unignored tokens (`// trufflehog:ignore`) are staged.
