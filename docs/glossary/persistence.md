# Persistence Context

Domain terms for embedded SQLite database foundation and connection lifecycles.

## Language

**Embedded Database Foundation**:
The `@devtools/db` local persistence layer using `bun:sqlite` with Drizzle ORM, WAL journal mode, and synchronous crash-resilient settings.
_Avoid_: Local storage layer, sqlite backend, persistence engine
