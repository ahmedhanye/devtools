---
name: test-authoring
description: Author and verify automated tests across monorepo workspaces. Use when doing TDD, writing, fixing, or refactoring unit, integration, or contract tests for packages, apps, API, CLI, frontend, or site.
---

# Test authoring

Authoritative testing workflow for runtime behavioral contracts, boundaries, and workspace test suites across the monorepo.

## Context pointers

- **Anti-patterns**: Read [references/anti-patterns.md](references/anti-patterns.md) for prohibited testing practices and compiler boundaries.
- **Core package**: Read [references/core.md](references/core.md) for `@devtools/core`.
- **Database package**: Read [references/db.md](references/db.md) for `@devtools/db`.
- **API application**: Read [references/api.md](references/api.md) for `@devtools/api`.
- **CLI application**: Read [references/cli.md](references/cli.md) for `@devtools/cli`.
- **Frontend application**: Read [references/frontend.md](references/frontend.md) for `@devtools/frontend`.
- **Site platform**: Read [references/site.md](references/site.md) for `@devtools/site`.

## Authoring workflow

Follow these steps in order when creating or updating test suites.

### 1. Identify workspace and testing seam

1. Identify the target package or application workspace.
2. Locate the public interface or seam where behavior is observable without inspecting private internals.
3. Invariant: verify dynamic runtime contracts, schema boundaries, and error conditions. Never author automated tests for types, JSX compilation, or static invariants that compilers and linters verify.
4. Autonomous test seams: proceed test-first without interactive confirmation modals (`ask_question`) when seams directly implement ticket acceptance criteria. Pre-agree seams with the user only when requirements are ambiguous or specify competing architectural designs.
5. Completion criterion: The public seam is identified and targets runtime behavior rather than static types or presentation details.

### 2. Consult workspace blueprint

1. Read the blueprint reference for the target workspace.
2. Follow the test runner conventions and patterns specified for that workspace.
3. Completion criterion: The test file imports the designated runner and adheres to the workspace blueprint patterns.

### 3. Author behavioral assertions

1. Write tests that verify the public contract and edge cases specified in the workspace blueprint.
2. Verify the authored tests adhere to [references/anti-patterns.md](references/anti-patterns.md).
3. Completion criterion: The authored tests contain zero prohibited anti-patterns and assert observable runtime behaviors.

### 4. Execute change-scoped verification

1. Run the change-scoped test command for the modified workspace.
2. Completion criterion: The test suite executes cleanly and all assertions pass with exit code 0.
