---
status: partially superseded by ADR-0006
date: 2026-10-06
---

# Embedded database foundation

> [!NOTE]
> Startup runtime migrations via `runMigrations()` and manual `SQLITE_BUSY` retry loops are superseded by [ADR 0006](0006-embedded-sqlite-lifecycle-and-scoped-teardown.md). The SQLite engine, Drizzle ORM, WAL concurrency safeguards, and path resolution strategy remain active.

Local application state uses an embedded SQLite database powered by `bun:sqlite` and Drizzle ORM inside `@devtools/db`, configured with WAL concurrency safeguards and environment-aware path resolution (`:memory:` in tests).

## Considered options

- **External database server or loose JSON files:** Rejected because external servers add installation overhead for a local CLI tool, while ad-hoc JSON files invite locking bugs and schema drift.

## Consequences

- Test suites run hermetically with isolated `:memory:` databases without filesystem side effects or lock contention; see [Persistence architecture](../architecture/persistence.md) for pragmas, path resolution, and lifecycle mechanics.
