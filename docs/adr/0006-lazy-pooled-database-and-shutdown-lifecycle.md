---
status: accepted
date: 2026-11-17
supersedes: ADR-0001 (startup database initialization)
contexts:
  - Persistence
  - Runtime
---

# Lazy pooled database and shutdown lifecycle

`@devtools/db` opens file-backed SQLite connections lazily through a canonical-path Database Handle Pool (`openDb`), applies bundled SQL schema initialization idempotently on first access (`initializeBaselineSchema`), serializes writes with `BEGIN IMMEDIATE`, and closes handles in Phase 3 (`persistence`) via `ShutdownCoordinator`.

## Considered options

- **Eager startup `runMigrations()` per caller (ADR 0001):** Rejected because eager initialization creates `.devtools/devtools.db` on non-database CLI invocations, duplicates SQLite connections across daemon handlers, and risks mid-shutdown database writes before HTTP ingress and background audits drain.

## Consequences

- Read-only CLI commands (`--help`, `--version`) create zero database files on disk, while active CLI and daemon commands share pooled WAL connections safely until `ShutdownCoordinator` completes ingress and work drain; see [Persistence Architecture](../architecture/persistence.md) for pool ref-counting and transaction mechanics.
