# Package configuration boundaries and environment seams

## Context

Shared packages (`packages/*`) such as `@devtools/db` and `@devtools/browser` provide runtime discovery conventions across development, test, and production environments. A previous blanket linter ban on `process.env` created artificial friction and required suppression comments, while direct ambient reads prevented concurrent test isolation.

## Decision

1. **Centralized Configuration Seam**: Shared packages isolate all environment variable reads into a single dedicated configuration module (`config.ts` or discovery seam). Domain repositories, services, and utilities remain pure and must not access ambient globals directly.
2. **Injectable Seams**: Every configuration resolution function accepts an optional `options.env?: Record<string, string | undefined>` seam that defaults to `process.env` only when omitted.
3. **Hermetic Test Isolation**: Tests pass explicit environment maps rather than mutating global `process.env`, preventing concurrency race conditions in parallel test runners.
4. **Linter Scoping**: Oxlint denies `node/no-process-env` across package source by default, granting exceptions exclusively to designated configuration seam modules via `.oxlintrc.json` overrides. File-level suppression comments are prohibited.

## Consequences

- Applications (`apps/cli`, `apps/api`) retain zero-config defaults (`import { db } from '@devtools/db'`).
- Test suites run concurrently without mutating global process state.
- Linter rules align with package architecture boundaries without suppressing diagnostics in code comments.
