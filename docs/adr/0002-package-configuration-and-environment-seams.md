---
status: accepted
date: 2026-10-19
contexts:
  - Persistence
  - Browser Automation
  - Performance Auditing
  - Runtime & CLI
---

# Package configuration boundaries and environment seams

Shared packages isolate all environment variable reads into a dedicated configuration module accepting an optional `options.env` Configuration Seam (defaulting to `process.env` only when omitted), while the linter denies `process.env` access everywhere else in package source without file-level suppressions.

## Considered options

- **Ambient `process.env` reads with test mutation or blanket linter suppressions:** Rejected because mutating global `process.env` breaks concurrent test isolation and suppression comments hide boundary leaks.

## Consequences

- Test suites pass explicit environment maps concurrently with zero global state mutation, while applications keep zero-config defaults; see [Monorepo Package Standards](../coding-standards/packages.md) for module layout and linter rules.
