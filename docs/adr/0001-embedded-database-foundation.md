---
status: partially superseded by ADR-0006
date: 2026-10-06
contexts:
  - Persistence
---

# Embedded database foundation

> [!NOTE]
> Startup runtime migrations via `runMigrations()` are superseded by [ADR 0006](0006-lazy-pooled-database-and-shutdown-lifecycle.md). The SQLite engine, Drizzle ORM, concurrency pragmas, path resolution, and package boundary remain active.

Local application state uses an embedded SQLite database powered by `bun:sqlite` and Drizzle ORM inside `@devtools/db`, configured with WAL + `SQLITE_BUSY` retry concurrency safeguards, environment-aware path resolution (`:memory:` in tests), and (originally) startup runtime migrations via `runMigrations()`.

## Considered options

- **External database server or loose JSON files:** Rejected because external servers add installation overhead for a local CLI tool, while ad-hoc JSON files invite locking bugs and schema drift.

## Consequences

- Test suites run hermetically with isolated `:memory:` handles without file-system side effects or lock contention.
- `@devtools/db` stays pure persistence infrastructure consumed through domain stores (such as `openLighthouseStore` in `@devtools/lighthouse`), while applications (`apps/cli`, `apps/api`) never import `@devtools/db` directly; see [Persistence Architecture](../architecture/persistence.md) for active pragma values, path resolution rules, and pooling mechanics.
