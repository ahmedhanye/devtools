---
status: accepted
date: 2026-10-06
contexts:
  - Persistence
---

# Embedded database foundation

Local application state uses an embedded SQLite database powered by `bun:sqlite` and Drizzle ORM inside `@devtools/db`, configured with WAL concurrency safeguards, startup embedded migrations, and environment-aware path resolution (`:memory:` in tests).

## Considered options

- **External database server or loose JSON files:** Rejected because external servers add installation overhead for a local CLI tool, while ad-hoc JSON files invite locking bugs and schema drift.

## Consequences

- CLI commands and the local daemon share one database file without lock contention, and test suites run hermetically in memory.
- `@devtools/db` stays pure persistence infrastructure while feature schemas aggregate in an acyclic dependency graph; see [Persistence Architecture](../architecture/persistence.md) for PRAGMA settings, path resolution rules, and migration mechanics.
