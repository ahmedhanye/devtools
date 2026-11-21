# Persistence Context

Domain terms for local database storage, lazy schema initialization, handle ownership, idle-close, and configuration seams.

## Language

**Multi-Environment Path Resolution**:
The deterministic path selection rule resolving database locations separately for tests (`:memory:`), local workspace development (`<repo_root>/.devtools/devtools.db`), and production or compiled standalone installations (`~/.devtools/devtools.db`).
_Avoid_: DB path resolver, database locator

**Lazy Schema Initialization**:
The first-use SQLite initialization hook (`initializeBaselineSchema`) checking SHA-256 migration hashes read-only before applying missing bundled Drizzle migrations inside an immediate write transaction.
_Avoid_: DB sync, schema push, manual migrator, startup migration runner

**Database Session**:
The borrowed read and write contract (`DbSession`) passed to feature packages (`@devtools/lighthouse`) without `close()` so stores cannot dispose caller-owned connections.
_Avoid_: Shared db global, raw connection handle

**Database Handle**:
The composition-root SQLite lifecycle owner (`DbHandle extends DbSession`) created by `openDb` with explicit `close()`, `[Symbol.dispose]()`, and 30-second automatic idle-close on file-backed connections.
_Avoid_: Global singleton connection, pooled db lease

**Configuration Seam**:
The injectable options interface allowing callers and tests to supply environment maps or settings explicitly without reading or mutating ambient process globals.
_Avoid_: Environment seam, env hack, config mock, process override
