# DevTools system architecture

High-level entry map to system topology, subsystem internals, and Architecture Decision Records across the DevTools monorepo.

DevTools separates deployable applications (`apps/*`), shared headless packages (`packages/*`), and the documentation site (`site/`). A single Bun Daemon (`devtools web`) mounts the Hono API (`/api/*`) and static Next.js frontend assets on one loopback port, lazily opens embedded SQLite (`@devtools/db`) with automatic idle-close, passes borrowed `DbSession` handles into domain stores, and runs deterministic LIFO teardown via `createTeardown()`.

> [!IMPORTANT]
> Headless packages (`packages/*`) never import from applications (`apps/*`) or `site/`. Application composition roots (`apps/cli/src/app/**`, `apps/cli/src/commands/web/**`, `apps/api/src/app/**`) own `@devtools/db` `DbHandle` lifecycles (`openDb`, `close()`), while route modules (`apps/api/src/modules/*`) and feature CLI commands (`apps/cli/src/commands/lighthouse`, `apps/cli/src/commands/browser`) stay DB-free and consume `@devtools/lighthouse` (`createLighthouseStore` over `DbSession`), enforced by `.fallowrc.json`.

## Architecture guides

| Guide                                                                     | Read when                                                                                                     |
| :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------ |
| [Monorepo architecture](docs/architecture/monorepo.md)                    | Getting a fast at-a-glance map of workspaces, folder ownership, dependency graph, and direct exports.         |
| [CLI and Daemon architecture](docs/architecture/cli-and-daemon.md)        | Working on `apps/cli`, Commander routing, programmatic CLI seams, Daemon hosting, or binary bundling.         |
| [HTTP API architecture](docs/architecture/api.md)                         | Working on `apps/api`, Hono routes, loopback security, SSE streaming, or HTTP status and error contracts.     |
| [Frontend application architecture](docs/architecture/frontend.md)        | Working on `apps/frontend`, FSD v2.1 topology, static export, or Daemon asset delivery.                       |
| [Persistence and database architecture](docs/architecture/persistence.md) | Working on `packages/db`, `DbSession`/`DbHandle` lifecycles, idle-close, WAL pragmas, or baseline migrations. |
| [Browser automation architecture](docs/architecture/browser.md)           | Working on `packages/browser`, the Browser Resolution Waterfall, binary verification, or cache installs.      |
| [Performance auditing architecture](docs/architecture/lighthouse.md)      | Working on `packages/lighthouse`, in-process execution, Representative Run selection, or 3-tier storage.      |

## Architecture decision records

System-wide architectural decisions live under `docs/adr/`:

| ADR                                                                                                                              | Status                             | Constraint and rationale                                                                                                                                                                |
| :------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001: Embedded database foundation](docs/adr/0001-embedded-database-foundation.md)                                              | `partially superseded by ADR-0006` | Use embedded SQLite (`bun:sqlite`) and Drizzle in WAL mode, not an external server or JSON files, so local CLI installs avoid setup overhead and lock drift.                            |
| [0003: Lighthouse audit subprocess isolation and 3-tier storage](docs/adr/0003-lighthouse-audit-isolation-and-tiered-storage.md) | `partially superseded by ADR-0005` | Pick one real Euclidean Representative Run (not per-metric medians), split hot/warm/cold storage, and keep Lighthouse schemas out of `@devtools/core` so reports match metrics 1:1.     |
| [0004: Lighthouse daemon API isolation and SSE](docs/adr/0004-lighthouse-daemon-api-isolation-and-sse.md)                        | `accepted`                         | Split `POST` job creation from `GET` SSE, expose pure `@devtools/lighthouse/schemas`, and sandbox HTML reports under `null` CSP so reloads recover jobs and reports stay isolated.      |
| [0005: In-process Lighthouse execution](docs/adr/0005-in-process-lighthouse-execution.md)                                        | `accepted`                         | Run Lighthouse in-process inside `@devtools/lighthouse`, not via `Bun.spawn`, because compiled binaries lack a `bun` interpreter and `:memory:` SQLite cannot cross OS processes.       |
| [0006: Embedded SQLite lifecycle and scoped teardown](docs/adr/0006-embedded-sqlite-lifecycle-and-scoped-teardown.md)            | `accepted`                         | Initialize SQLite lazily, pass `DbSession` (no `close()`) to stores, and use per-instance LIFO teardown so non-DB CLI commands stay file-free and shutdown hooks never overwrite.       |
| [0007: Static-export query-parameter routing](docs/adr/0007-static-export-query-param-routing.md)                                | `accepted`                         | Use flat static routes with query parameters (`?id=`, `?job=`, `?runs=`) instead of dynamic `[id]` segments so static `output: "export"` serves runtime entities without a Node server. |
