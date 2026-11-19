---
status: accepted
date: 2026-10-06
contexts:
  - Persistence
---

# Embedded database foundation

Local application state uses an embedded SQLite database powered by `bun:sqlite` and Drizzle ORM inside `@devtools/db`, configured with lazy pooled handles (`openDb`), WAL + `SQLITE_BUSY` retry concurrency safeguards, bundled baseline initialization (`initializeBaselineSchema`), and environment-aware path resolution (`:memory:` in tests).

## Considered options

- **External database server or loose JSON files:** Rejected because external servers add installation overhead for a local CLI tool, while ad-hoc JSON files invite locking bugs and schema drift.

## Consequences

- CLI commands and the local daemon share one database file lazily without startup overhead or lock contention, and test suites run hermetically with isolated `:memory:` handles.
- `@devtools/db` stays pure persistence infrastructure consumed through domain stores (such as `openLighthouseStore` in `@devtools/lighthouse`), while applications (`apps/cli`, `apps/api`) never import `@devtools/db` directly; see [Persistence Architecture](../architecture/persistence.md) for PRAGMA settings, path resolution rules, and pooling mechanics.
