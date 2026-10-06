---
trigger:
  - "package.json"
  - "apps/*/package.json"
  - "packages/*/package.json"
  - "bun.lock"
description: Monorepo workspace boundaries and dependency declaration rules.
---

# Monorepo dependency invariants

Rules for package management, workspace boundaries, and dependency placement across this repository.

## Workspace roles

1. The workspace root holds only repository orchestration and static analysis tools (for example, `oxlint`, `prettier`, `typescript`, `fallow`, `@types/bun`). It holds zero application runtime packages.
2. Each leaf workspace (`apps/*`, `packages/*`) manages its own runtime and build dependencies in its own `package.json`.
3. The shared core package (`packages/core`) provides domain schemas, types, and error definitions. It never holds frontend-specific types, UI components, or browser APIs. Leaf applications consume it via the `workspace:*` protocol.

## Dependency placement rules

1. Declare runtime dependencies in the importing workspace's `package.json`. Disallow phantom dependencies that resolve through root hoisting.
2. Place package-specific linter plugins (`@shadcn/lint`, `steiger`) in the leaf workspace that uses them, not in the workspace root.
3. Keep the TypeScript compiler (`typescript`) at the workspace root to maintain a single version across packages. Subpackages run `tsc --noEmit` without declaring a local `typescript` dependency.
