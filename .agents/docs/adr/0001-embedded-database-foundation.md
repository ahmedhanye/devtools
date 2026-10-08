# 0001: Embedded database foundation (@devtools/db)

## Context

DevTools requires an embedded local persistence layer to store configuration, audit results, telemetry, background tasks, and application state across its CLI commands and HTTP daemon processes. Without a unified database strategy, services risk fragmented storage mechanisms, ad-hoc file I/O, file locking conflicts (`SQLITE_BUSY`), schema drift, and brittle test suites that mutate disk state.

## Decision

1. **Native engine and ORM**:
   - Use Bun's native `bun:sqlite` engine for microsecond synchronous queries and zero external compilation overhead.
   - Use Drizzle ORM (`drizzle-orm` and `drizzle-kit`) for lightweight TypeScript SQL-first query building, type-safe schema definitions, relational querying (`db.query.*`), and automated migrations.

2. **Concurrency safeguards and SQLite pragmas**:
   Every database connection automatically applies strict concurrency and integrity safeguards upon initialization:
   - `PRAGMA journal_mode = WAL;` (Write-Ahead Logging allows concurrent readers and writers without lock contention).
   - `PRAGMA busy_timeout = 5000;` (Waits up to 5 seconds on lock acquisition before raising `SQLITE_BUSY`).
   - `PRAGMA foreign_keys = ON;` (Enforces referential integrity cascades).
   - `PRAGMA synchronous = NORMAL;` (Provides crash-resilient write performance in WAL mode).

3. **Multi-environment path resolution (resolveDatabasePath)**:
   - **Test (`NODE_ENV === 'test'` or `BUN_ENV === 'test'`)**: Resolves to `:memory:` for hermetic, diskless, high-speed test runs.
   - **Local Workspace Development (`NODE_ENV !== 'production'`)**: Resolves to `<repo_root>/.devtools/devtools.db` (gitignored, Django-like local experience).
   - **Production (Packaged CLI / Daemon)**: Resolves to `~/.devtools/devtools.db` or an explicit `DEVTOOLS_DB_PATH` / `DATABASE_URL` override.
   - Parent directories are automatically ensured with recursive directory creation (`mkdirSync(..., { recursive: true })`) before opening SQLite connections.

4. **Monorepo package boundary and modular schema architecture**:
   - `@devtools/db` (`packages/db`) is generic database infrastructure: manages connections, PRAGMAs, schema aggregation boundary, migration runners, and re-exported Drizzle primitives/types.
   - `@devtools/db` does not house domain business logic. Downstream feature packages (`packages/feature-*`), `apps/api`, and `apps/cli` import the typed client and schemas to implement domain repositories, services, and queries.
   - Modular schemas live in `packages/db/src/schema/<domain>.ts` and are aggregated in `packages/db/src/schema/index.ts`, maintaining an acyclic DAG (`feature -> @devtools/db`).

5. **Migration lifecycle**:
   - Programmatic runtime migrations run on startup via `runMigrations()` using `drizzle-orm/bun-sqlite/migrator`.
   - Schema generation is driven via `drizzle-kit generate` to maintain immutable snapshot SQL files under `packages/db/drizzle/`.

## Consequences

- Concurrency conflicts between CLI commands and the persistent daemon are eliminated through WAL mode and busy timeouts.
- Test suites run hermetically in memory without file system side effects or shared state.
- Single source of truth for ORM types and schema primitives prevents dependency drift across packages.
- Adding new feature schemas follows an acyclic pattern where feature logic remains isolated while schema definitions remain introspectable for migrations and relational queries.
