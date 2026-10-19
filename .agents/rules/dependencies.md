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

## Configuration seams and ambient environment variables

When designing or modifying shared packages (`packages/*`):

1. **Centralized Configuration Seams**: Packages must isolate all access to ambient environment variables (`process.env`) strictly into a single dedicated configuration module (such as `config.ts` or discovery seams). Domain repositories, services, utilities, and models must not access ambient globals directly.
2. **Injectable environment parameter**: Every configuration resolution function reading environment variables must accept an optional injection parameter (e.g., `options?: { env?: Record<string, string | undefined> }`), falling back to `process.env` only when omitted.
3. **Hermetic testing without global mutation**: Unit tests must pass explicit `{ env: ... }` parameters rather than mutating global `process.env`, preventing concurrency race conditions in parallel test runners.
4. **Linter rule enforcement**: `.oxlintrc.json` denies `node/no-process-env` across package source by default, with scoped overrides granting access solely to canonical configuration modules. File-level `/* oxlint-disable */` comments are forbidden.
