---
status: accepted
date: 2026-11-17
supersedes: ADR-0001 (startup database initialization)
contexts:
  - Persistence
  - Runtime
---

# Embedded SQLite lifecycle and scoped teardown

`@devtools/db` splits database access into borrowed read/write-only `DbSession` contracts for feature packages and owner-only `DbHandle` lifecycles (`openDb`) for application composition roots, applies embedded SHA-256 migrations idempotently on first physical open (`initializeBaselineSchema`), automatically closes idle file-backed connections after 30 seconds (`PRAGMA busy_timeout = 0` then `PRAGMA optimize` and `sqlite.close(true)`), and coordinates shutdown through per-instance scoped LIFO `createTeardown()` scopes.

## Considered options

- **Eager startup `runMigrations()` per caller (ADR 0001):** Rejected because eager initialization creates `.devtools/devtools.db` on non-database CLI invocations.
- **Global connection pool and 3-phase `ShutdownCoordinator`:** Rejected because a process-global hook registry and pooled ref-counting caused cross-instance hook overwrite and connection-closure bugs while duplicating SQLite WAL + `PRAGMA busy_timeout` concurrency guarantees.

## Consequences

- Read-only CLI commands (`--help`, `--version`, `browser status`) dynamically skip `@devtools/db` and create zero database files on disk.
- Composition roots (`apps/cli/src/app/**`, `apps/cli/src/commands/web/**`, `apps/api/src/app/**`) own `DbHandle` disposal and run LIFO teardown (`server.stop(true)` then active work abort then `db.close()`), while feature packages (`@devtools/lighthouse`) receive borrowed `DbSession` handles that cannot close caller connections; see [Persistence Architecture](../architecture/persistence.md) and [CLI and Daemon Architecture](../architecture/cli-and-daemon.md) for active pragmas, idle-close rules, and teardown sequences.
