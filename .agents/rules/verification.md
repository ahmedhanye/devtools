---
trigger:
  - "**"
description: Change-scoped verification matrix, observable verification standards, and reactive background execution rules.
---

# Verification and background execution rules

Rules for selecting verification commands tailored to changed files, defining observable acceptance criteria, and executing background tasks reactively.

## Decision matrix for verification

Run proportionate, change-scoped checks during iterative development. Run the full verification gate before opening a pull request or when modifying cross-package contracts.

| Changed files                                | Verification scope    | Commands                                                                                                                                                            |
| -------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/**`, `.github/actions/**` | Workflow validation   | `bunx prettier --check .github/workflows/** .github/actions/**` <br> `bun scripts/verify-staged-secrets.ts .github/workflows/** .github/actions/**`                 |
| `apps/<pkg>/**`                              | Application workspace | `bun --filter @devtools/<pkg> typecheck` <br> `bun --filter @devtools/<pkg> test` <br> (For frontend: `bun --filter @devtools/frontend lint:design` and `lint:fsd`) |
| `packages/<pkg>/**`                          | Package workspace     | `bun --filter @devtools/<pkg> typecheck` <br> `bun --filter @devtools/<pkg> test`                                                                                   |
| `site/content/**`                            | Documentation content | `bun --filter @devtools/site typecheck` <br> `bun --filter @devtools/site build` <br> `bun run check`                                                               |
| `site/**` (site application code)            | Site workspace        | `bun --filter @devtools/site typecheck` <br> `bun --filter @devtools/site test` <br> `bun --filter @devtools/site build`                                            |
| `scripts/**`                                 | Internal scripts      | `bun test scripts/` <br> `bun run check`                                                                                                                            |
| `.agents/**`, repository docs (`*.md`)       | Docs and guidelines   | `bun run check`                                                                                                                                                     |
| Cross-cutting / Pre-PR gate                  | Full quality gate     | `bun run verify`                                                                                                                                                    |

## Workflow change invariant

Pull requests modifying only `.github/workflows/**` or `.github/actions/**` specify workflow validation (`bunx prettier --check .github/workflows/** .github/actions/**`, `bun scripts/verify-staged-secrets.ts .github/workflows/** .github/actions/**`) rather than monorepo application test suites. Restrict checks to workflow and secret validation when changes are isolated to CI workflow definitions.

## Observable verification

1. Write acceptance criteria as checkable automated commands or observable behaviors (test runs, exit codes, HTTP status codes).
2. Record concrete verification evidence in pull request descriptions.
3. Run targeted package or script checks during iterative development, reserving full `bun run verify` runs for cross-package contracts and pre-PR gates.

## Test authoring and contract standards

When authoring or modifying test files across any monorepo workspace:

1. Read and adhere to `.agents/docs/testing.md` for permitted behavioral contract patterns and prohibited testing anti-patterns.
2. Verify dynamic runtime behavior, schema boundaries, and error conditions. Never author tests that assert static copy, document inventories, exact headings, utility styling classes, or trivial variable equality.
3. Rely on compilers (`tsc`, `fumadocs-mdx`, `next build`) for syntax, types, and static routes.

## Reactive background execution

1. Await reactive system completion notifications for background tasks. Yield execution immediately without polling status loops or sleep commands.
2. The execution system notifies the agent upon task completion. Proceed with other work or stop calling tools while background tasks run.
