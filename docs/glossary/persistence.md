# Persistence Context

Domain terms for embedded SQLite database foundation, schema migrations, and connection lifecycles.

## Language

**Embedded Database Foundation**:
The `@devtools/db` local persistence layer using `bun:sqlite` with Drizzle ORM, WAL journal mode, and crash-resilient pragmas.
_Avoid_: Local storage layer, sqlite backend, persistence engine

**Write-Ahead Logging (WAL)**:
The SQLite concurrency mode (`PRAGMA journal_mode = WAL`) enabling concurrent reader connections alongside a single writer without database lock contention.
_Avoid_: Journal mode, rollback journal, sqlite locks

**Multi-Environment Path Resolution**:
The deterministic 4-step algorithm in `@devtools/db` resolving database locations across test (`:memory:`), workspace dev (`.devtools/devtools.db`), and production (`~/.devtools/devtools.db`).
_Avoid_: DB path resolver, database locator

**Startup Migration Runner**:
The programmatic initialization hook (`runMigrations`) applying versioned Drizzle migrations to SQLite on process start prior to opening network listeners.
_Avoid_: DB sync, schema push, manual migrator

**Configuration Seam**:
The parameter interface (`options.env`) enabling callers and test suites to supply environment variables explicitly without mutating ambient process globals.
_Avoid_: Env hack, config mock, process override
