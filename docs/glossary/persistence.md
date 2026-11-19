# Persistence Context

Domain terms for local database storage, lazy schema initialization, handle pooling, and configuration seams.

## Language

**Multi-Environment Path Resolution**:
The deterministic path selection rule resolving database locations separately for tests (`:memory:`), local workspace development (`<repo_root>/.devtools/devtools.db`), and production or compiled standalone installations (`~/.devtools/devtools.db`).
_Avoid_: DB path resolver, database locator

**Lazy Schema Initialization**:
The first-use SQLite initialization hook (`initializeBaselineSchema`) verifying or applying the bundled Drizzle schema inside an immediate write transaction without requiring eager startup migrations.
_Avoid_: DB sync, schema push, manual migrator, startup migration runner

**Database Handle Pool**:
The ref-counted per-process map pooling file-backed `bun:sqlite` connections by canonical resolved path via `openDb` while keeping `:memory:` handles isolated.
_Avoid_: Global singleton connection, ambient db global

**Configuration Seam**:
The injectable options interface allowing callers and tests to supply environment maps or settings explicitly without reading or mutating ambient process globals.
_Avoid_: Environment seam, env hack, config mock, process override
