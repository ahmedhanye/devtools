# Persistence and database architecture

Embedded SQLite foundation, Database Handle Pool, WAL concurrency, Lazy Schema Initialization, and Multi-Environment Path Resolution for `packages/db`.

## Module responsibilities

| Path                          | Responsibility                                                                             | Entrypoint                          |
| :---------------------------- | :----------------------------------------------------------------------------------------- | :---------------------------------- |
| `packages/db/drizzle/`        | Versioned Drizzle SQL migration files and `meta/_journal.json`.                            | Statically bundled by `migrator.ts` |
| `packages/db/src/schema/`     | Drizzle tables (`system.ts` for `system_metadata`, `lighthouse.ts` for `lighthouse_runs`). | `packages/db/src/schema/index.ts`   |
| `packages/db/src/client.ts`   | Lazy `openDb` Database Handle Pool, `SQLITE_BUSY` retry, `BEGIN IMMEDIATE`, shutdown hook. | `packages/db/src/index.ts`          |
| `packages/db/src/config.ts`   | Multi-Environment Path Resolution (`resolveDatabaseTargetPath`, `resolveDatabasePath`).    | `packages/db/src/index.ts`          |
| `packages/db/src/migrator.ts` | Bundled SQL Lazy Schema Initialization (`initializeBaselineSchema`).                       | `packages/db/src/index.ts`          |

## Lazy pooled handle lifecycle

```mermaid
flowchart TD
  Open["openDb(options)"] --> Lazy["Return lazy DbHandle<br/>(zero files or sockets created)"]
  Lazy --> FirstUse["First .read() / .write() / .ensureReady()"]
  FirstUse --> Pool{"memory: true?"}
  Pool -- Yes --> Mem["Isolated :memory: SQLite<br/>(no pool, no WAL)"]
  Pool -- No --> FilePool["Canonical path ref-counted pool<br/>+ WAL pragmas + per-registry lease hooks"]
  Mem --> Init["initializeBaselineSchema()<br/>(lock-free watermark check)"]
  FilePool --> Init
  Init --> Write["handle.write(): BEGIN IMMEDIATE<br/>+ nestedTx savepoints + withSqliteBusyRetry"]
  FilePool --> Shutdown["Phase 3 persistence lease release<br/>(WAL checkpoint + close at refCount 0)"]
```

- **Statically bundled schema.** `packages/db/src/migrator.ts` statically imports `packages/db/drizzle/*.sql` (`with { type: "text" }`) and `drizzle/meta/_journal.json` (`with { type: "json" }`) so compiled single-file binaries (`dist/devtools`) initialize and upgrade tables without external SQL files on disk.
- **Idempotent first-access init and upgrades.** When `autoInit !== false`, first access checks `sqlite_master` and the `__devtools_migrations` watermark read-only without a write lock. Empty databases apply all bundled migrations inside `BEGIN IMMEDIATE`, tracked databases apply only migrations newer than `MAX(created_at)`, up-to-date databases return immediately, and foreign databases with unrelated tables and no `__devtools_migrations` table stay untouched.
- **Per-coordinator shutdown ordering.** Each pooled handle registers its own lease callback on its `ShutdownRegistry` Phase 3 (`persistence`) hook. Manual `close()` detaches that lease and unregisters the hook when the registry has no active leases left. A stopping coordinator releases only its own leases, so SQLite checkpoints WAL and closes only after HTTP `ingress` and background `work` finish and total `refCount` across all coordinators reaches zero.

## SQLite concurrency pragmas (ADR 0001)

Per [ADR 0001](../adr/0001-embedded-database-foundation.md), file-backed connections apply these pragmas on open (in-memory databases skip WAL):

| Pragma         | Value    | Purpose                                                                      |
| :------------- | :------- | :--------------------------------------------------------------------------- |
| `journal_mode` | `WAL`    | Allows concurrent readers alongside one active writer without read blocking. |
| `synchronous`  | `NORMAL` | Preserves crash safety in WAL mode without per-commit `fsync` stalls.        |
| `foreign_keys` | `ON`     | Enforces referential integrity at the SQLite engine level.                   |
| `busy_timeout` | `5000`   | Waits up to 5 seconds on lock contention before raising `SQLITE_BUSY`.       |

## Multi-Environment Path Resolution (ADR 0002)

`packages/db/src/config.ts` consumes `@devtools/core/node` (`findWorkspaceRoot`, `isStandaloneRuntime`) with injectable `env`, `cwd`, `memory`, and `isStandalone` Configuration Seams:

| Priority | Condition                                                  | Resolved target                                 |
| :------: | :--------------------------------------------------------- | :---------------------------------------------- |
|    1     | `memory: true`                                             | `:memory:`                                      |
|    2     | `customPath`, `DEVTOOLS_DB_PATH`, or `DATABASE_URL` is set | `:memory:` or path resolved from `cwd`          |
|    3     | `NODE_ENV === "test"` or `BUN_ENV === "test"`              | `:memory:`                                      |
|    4     | `isStandaloneRuntime()` or `NODE_ENV === "production"`     | `~/.devtools/devtools.db`                       |
|    5     | Local workspace development (fallback)                     | `<workspace_root or cwd>/.devtools/devtools.db` |

> [!TIP]
> Pass `openDb({ memory: true })` (or `openLighthouseStore({ memory: true })`) in tests for isolated in-memory databases with zero disk I/O and zero cross-test pool sharing.

For the 3-tier `lighthouse_runs` schema implemented in `packages/db/src/schema/lighthouse.ts`, see [Performance auditing architecture](lighthouse.md#3-tier-storage-architecture).
