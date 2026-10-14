---
trigger:
  - "package.json"
  - "apps/*/package.json"
  - "packages/*/package.json"
  - "site/package.json"
  - "bun.lock"
description: Workspace package scaffolding and telemetry suppression rules.
---

# Monorepo dependency invariants

Rules for adding workspace packages and suppressing dependency telemetry.

## Workspace scaffolding

When adding or removing a workspace package under `apps/*` or `packages/*`:

1. Update `.coderabbit.yaml` (`reviews.path_instructions`) with the package architectural boundaries and domain review contracts.
2. Update `.fallowrc.json` with new architecture boundary zones and import rules if the package introduces new structural layers.
3. Configure `tsconfig.json` to extend `tsconfig.base.json` and declare inter-workspace dependencies using the `workspace:*` protocol.

## Telemetry suppression

When introducing or updating a tool, CLI, or library:

1. Check whether the package collects telemetry, crash reports, or usage analytics.
2. Disable telemetry through native configuration files when supported (such as `core.disableTelemetry` in Storybook).
3. Add the package kill switch environment variable to `.env.example` and `.github/workflows/*.yml`.
4. Honor `DO_NOT_TRACK=1` alongside tool-specific kill switches.
