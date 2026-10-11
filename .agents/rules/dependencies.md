---
trigger:
  - "package.json"
  - "apps/*/package.json"
  - "packages/*/package.json"
  - "site/package.json"
  - "bun.lock"
description: Monorepo workspace boundaries and dependency declaration rules.
---

# Monorepo dependency invariants

Rules for package management, workspace boundaries, and dependency placement across this repository.

## Workspace roles

1. The workspace root holds only repository orchestration and static analysis tools (for example, `oxlint`, `prettier`, `typescript`, `fallow`, `@types/bun`). Application runtime packages belong in leaf workspaces.
2. Each leaf workspace (`apps/*`, `packages/*`, `site`) manages its own runtime and build dependencies in its own `package.json`.
3. The shared core package (`packages/core`) provides domain schemas, types, and error definitions. It isolates runtime-agnostic primitives and omits frontend-specific types, UI components, and browser APIs. Leaf applications consume it via the `workspace:*` protocol.

## Dependency placement rules

1. Declare every runtime dependency directly in the importing workspace's `package.json` to eliminate phantom dependencies resolving through root hoisting.
2. Place package-specific linter plugins (`@shadcn/lint`, `steiger`) in the leaf workspace that uses them, not in the workspace root.
3. Keep the TypeScript compiler (`typescript`) at the workspace root to maintain a single version across packages. Subpackages run `tsc --noEmit` without declaring a local `typescript` dependency.

## Workspace lifecycle

When adding or removing a workspace package under `apps/*` or `packages/*`:

1. Update `.coderabbit.yaml` (`reviews.path_instructions`) with the package's architectural boundaries and domain review contracts.
2. Update `.fallowrc.json` with new architecture boundary zones and import rules if the package introduces new structural layers.
3. Configure `tsconfig.json` to extend `tsconfig.base.json` and declare inter-workspace dependencies using the `workspace:*` protocol.
4. Verify root orchestration: ensure `bun run typecheck`, `bun run lint`, and `bun run test` cover the new workspace package.

## Telemetry suppression for tools and packages

When introducing or updating a tool, CLI, or library:

1. Check whether the package collects telemetry, crash reports, or usage analytics.
2. Disable telemetry through native configuration files when supported (such as `core.disableTelemetry` in Storybook).
3. Add the package's kill switch environment variable to `.env.example` and `.github/workflows/*.yml`.
4. Honor `DO_NOT_TRACK=1` alongside tool-specific kill switches.
