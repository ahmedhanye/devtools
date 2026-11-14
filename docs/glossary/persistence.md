# Persistence Context

Domain terms for local database storage, migration execution, and configuration seams.

## Language

**Multi-Environment Path Resolution**:
The deterministic path selection rule resolving database locations separately for tests, local workspace development, and production installations.
_Avoid_: DB path resolver, database locator

**Startup Migration Runner**:
The initialization hook applying versioned database migrations on process startup before opening network listeners.
_Avoid_: DB sync, schema push, manual migrator

**Configuration Seam**:
The injectable options interface allowing callers and tests to supply environment maps or settings explicitly without reading or mutating ambient process globals.
_Avoid_: Environment seam, env hack, config mock, process override
