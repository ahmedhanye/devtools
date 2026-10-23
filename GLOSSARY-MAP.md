# Glossary Map

Domain vocabulary for DevTools packages and applications mapped across bounded contexts.

## Contexts

- [Runtime & CLI](./docs/glossary/runtime.md): single Bun daemon process, API routing, runtime stack, standalone executable compilation, and release manifests.
- [Browser Automation](./docs/glossary/browser.md): Chrome for Testing binary resolution waterfall, caching hierarchy, and explicit path overrides.
- [Persistence](./docs/glossary/persistence.md): embedded SQLite engine, Drizzle ORM primitives, and schema migrations.

## Relationships

- **Runtime & CLI → Persistence**: The runtime daemon and CLI commands initialize `@devtools/db` connections, run migrations on startup, and query application state.
- **Runtime & CLI → Browser Automation**: CLI browser commands execute the browser resolution waterfall and consume cached Chrome for Testing executables.
- **Shared Contracts (`@devtools/core`)**: Supplies shared domain schemas, types, and error primitives across all contexts.

## Architectural Decisions

System-wide architectural decision records documented under [docs/adr/](./docs/adr/README.md):

- [0001: Embedded Database Foundation](./docs/adr/0001-embedded-database-foundation.md): `@devtools/db` local persistence layer using `bun:sqlite` with Drizzle ORM, WAL journal mode, and crash-resilient pragmas.
- [0002: Package Configuration Boundaries and Environment Seams](./docs/adr/0002-package-configuration-and-environment-seams.md): Centralized configuration modules and injectable `env` seams for hermetic test isolation without ambient `process.env`.
