---
status: partially superseded by ADR-0006
date: 2026-10-06
contexts:
  - Persistence
---

# Embedded database foundation

> [!NOTE]
> Startup runtime migrations via `runMigrations()` and manual `SQLITE_BUSY` retry loops are superseded by [ADR 0006](0006-embedded-sqlite-lifecycle-and-scoped-teardown.md). The SQLite engine, Drizzle ORM, WAL concurrency pragmas, path resolution, and composition-root boundary remain active.

Local application state uses an embedded SQLite database powered by `bun:sqlite` and Drizzle ORM inside `@devtools/db`, configured with WAL + `PRAGMA busy_timeout` concurrency safeguards, environment-aware path resolution (`:memory:` in tests), and (originally) startup runtime migrations via `runMigrations()`.

## Considered options

- **External database server or loose JSON files:** Rejected because external servers add installation overhead for a local CLI tool, while ad-hoc JSON files invite locking bugs and schema drift.

## Consequences

- Test suites run hermetically with isolated `:memory:` handles without file-system side effects or lock contention.
- Application composition roots (`apps/cli`, `apps/api`) own `@devtools/db` `DbHandle` lifecycles (`openDb`, `close()`), while domain stores (such as `createLighthouseStore` in `@devtools/lighthouse`) accept borrowed read/write-only `DbSession` instances and route modules or feature commands stay DB-free; see [Persistence Architecture](../architecture/persistence.md) for active pragma values, path resolution rules, and idle-close mechanics.
