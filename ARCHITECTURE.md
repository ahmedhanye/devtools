# DevTools system architecture

High-level entry map to system topology, subsystem internals, and Architecture Decision Records across the DevTools monorepo.

DevTools separates deployable applications (`apps/*`), shared headless packages (`packages/*`), and the documentation site (`site/`). A single Bun Daemon (`devtools web`) mounts the Hono API (`/api/*`) and static Next.js frontend assets on one loopback port, uses lazy pooled SQLite persistence (`@devtools/db`) behind domain stores, and runs deterministic 3-phase shutdown (`ingress` -> `work` -> `persistence`) via `ShutdownCoordinator`.

> [!IMPORTANT]
> Headless packages (`packages/*`) never import from applications (`apps/*`) or `site/`. Server applications (`apps/cli`, `apps/api`) access persistence through `@devtools/lighthouse` (`openLighthouseStore`) and never import `@devtools/db` directly, enforced by `.fallowrc.json`.

## Architecture guides

| Guide                                                                     | Read when                                                                                                 |
| :------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------- |
| [Monorepo architecture](docs/architecture/monorepo.md)                    | Getting a fast at-a-glance map of workspaces, folder ownership, dependency graph, and direct exports.     |
| [CLI and Daemon architecture](docs/architecture/cli-and-daemon.md)        | Working on `apps/cli`, Commander routing, Programmatic CLI Seams, Daemon hosting, or binary bundling.     |
| [HTTP API architecture](docs/architecture/api.md)                         | Working on `apps/api`, Hono routes, loopback security, SSE streaming, or HTTP status and error contracts. |
| [Frontend application architecture](docs/architecture/frontend.md)        | Working on `apps/frontend`, FSD v2.1 topology, static export, or Daemon asset delivery.                   |
| [Persistence and database architecture](docs/architecture/persistence.md) | Working on `packages/db`, pooled `openDb` lifecycles, WAL pragmas, or bundled baseline initialization.    |
| [Browser automation architecture](docs/architecture/browser.md)           | Working on `packages/browser`, the Browser Resolution Waterfall, binary verification, or cache installs.  |
| [Performance auditing architecture](docs/architecture/lighthouse.md)      | Working on `packages/lighthouse`, in-process execution, Representative Run selection, or 3-tier storage.  |

## Architecture decision records

System-wide architectural decisions live under `docs/adr/`:

| ADR                                                                                                                   | Status                             | Contexts                               | Summary                                                                                                                                          |
| :-------------------------------------------------------------------------------------------------------------------- | :--------------------------------- | :------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001: Embedded database foundation](docs/adr/0001-embedded-database-foundation.md)                                   | `accepted`                         | Persistence                            | Embedded SQLite (`bun:sqlite`) with Drizzle ORM, lazy pooled `openDb` handles, WAL + busy-retry safeguards, and `:memory:` test parity.          |
| [0002: Package configuration seams](docs/adr/0002-package-configuration-and-environment-seams.md)                     | `accepted`                         | Persistence, Browser, Performance, CLI | Isolate `process.env` reads into `config.ts` modules with injectable `options.env` Configuration Seams for concurrent tests.                     |
| [0003: Lighthouse audit isolation and tiered storage](docs/adr/0003-lighthouse-audit-isolation-and-tiered-storage.md) | `partially superseded by ADR-0005` | Performance, Persistence, Runtime      | Original subprocess isolation (superseded by ADR 0005), Euclidean Representative Run selection, 3-tier storage, and `@devtools/core` exclusion.  |
| [0004: Lighthouse daemon API isolation and SSE](docs/adr/0004-lighthouse-daemon-api-isolation-and-sse.md)             | `accepted`                         | Performance, Runtime, Frontend         | Single-flight `POST` plus `GET` SSE contract, `AbortSignal` shutdown, `@devtools/lighthouse/schemas`, all-verb loopback checks, and CSP sandbox. |
| [0005: In-process Lighthouse execution](docs/adr/0005-in-process-lighthouse-execution.md)                             | `accepted`                         | Performance, Runtime                   | Run Lighthouse iterations in-process inside `@devtools/lighthouse` for compiled single-file binaries, leaving job concurrency to `apps/api`.     |
