---
status: accepted
date: 2026-11-17
supersedes: ADR-0001 (startup database initialization)
---

# Embedded SQLite lifecycle and scoped teardown

`@devtools/db` splits database access into borrowed read/write-only `DbSession` contracts for feature packages and owner-only `DbHandle` lifecycles for application composition roots, initializes bundled SHA-256 migrations lazily on first physical open, automatically closes idle file-backed connections, and coordinates shutdown through per-instance scoped LIFO teardown.

## Considered options

- **Eager startup `runMigrations()` per caller ([ADR 0001](0001-embedded-database-foundation.md)):** Rejected because eager initialization creates `.devtools/devtools.db` on non-database CLI invocations.
- **Global connection pool and 3-phase `ShutdownCoordinator`:** Rejected because a process-global hook registry and pooled ref-counting caused cross-instance hook overwrites and premature connection-closure bugs while duplicating SQLite WAL concurrency guarantees.

## Consequences

- Non-database CLI commands (`--help`, `--version`, `browser status`) create zero database files on disk.
- Feature packages receive borrowed `DbSession` handles and cannot close caller-owned connections; see [Persistence architecture](../architecture/persistence.md) and [CLI and Daemon architecture](../architecture/cli-and-daemon.md) for pragmas, idle-close mechanics, and teardown ordering.
