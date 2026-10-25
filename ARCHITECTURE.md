# DevTools System Architecture

System topology, component interactions, runtime lifecycles, and architectural boundaries across the DevTools monorepo.

## System architecture overview

DevTools is a developer tooling monorepo providing utilities across command-line, background daemon, HTTP API, and web dashboard interfaces. The system is designed around a set of core architectural principles:

1. **Three-tier monorepo composition**: Code is partitioned into deployable applications (`apps/*`), shared headless domain packages (`packages/*`), and a documentation platform (`site/`).
2. **Strict unidirectional dependencies**: Headless packages (`packages/*`) never import from applications (`apps/*`) or documentation (`site/`). `@devtools/core` is a zero-dependency foundation; `@devtools/db` and `@devtools/browser` consume `@devtools/core`. Consuming applications depend on packages via Bun workspace protocols (`"workspace:*"`). Sibling applications never cross-import source files directly.
3. **Buildless development with direct source exports**: Internal packages declare direct source exports (`"exports": { ".": "./src/index.ts" }`). Consuming workspaces resolve TypeScript source files directly via `moduleResolution: "bundler"`, eliminating build steps during development.
4. **Unified loopback daemon host**: The local daemon (`devtools web`) consolidates backend API services (`apps/api` mounted on `/api/*`) and pre-rendered Next.js static assets (`apps/frontend/dist`) into a single Bun process listening on one port.
5. **Crash-resilient embedded persistence**: Local state is stored in an embedded SQLite database (`bun:sqlite`) using Drizzle ORM with Write-Ahead Logging (`WAL` mode) and startup migration execution per [ADR 0001](docs/adr/0001-embedded-database-foundation.md).
6. **Centralized configuration seams**: Domain packages isolate environment variable resolution into `config.ts` modules accepting injectable `options.env` seams for hermetic test execution per [ADR 0002](docs/adr/0002-package-configuration-and-environment-seams.md).
7. **3-tier Chromium resolution waterfall**: Automated browser resolution evaluates explicit overrides, local managed cache and system installations, before offering actionable terminal remediation.
8. **Feature-Sliced Design frontend**: The web dashboard is structured around FSD v2.1 layers (`app` -> `pages` -> `features` -> `entities` -> `shared`) with thin Next.js App Router boundary adapters.

## Component interaction model

```mermaid
graph TD
  subgraph Applications ["apps/* & site/"]
    CLI["apps/cli<br/>(DevTools CLI & Daemon)"]
    API["apps/api<br/>(Hono HTTP Routes)"]
    Frontend["apps/frontend<br/>(Next.js App Router / FSD)"]
    Site["site/<br/>(Fumadocs MDX Docs)"]
  end

  subgraph Packages ["packages/* (Headless Domain Packages)"]
    Core["packages/core<br/>(Zod Schemas, Domain Errors)"]
    DB["packages/db<br/>(SQLite / Drizzle ORM / Migrations)"]
    Browser["packages/browser<br/>(Chromium Waterfall / Cache)"]
  end

  subgraph External ["External & System Boundaries"]
    SQLiteFile[("Local SQLite Database<br/>(~/.devtools/devtools.db)")]
    CfT[("Chrome for Testing Binaries<br/>(~/.devtools/browsers/)")]
    BrowserClient["Developer Web Browser"]
  end

  CLI --> API
  CLI --> Core
  CLI --> DB
  CLI --> Browser
  API --> Core
  Frontend --> Core
  DB --> Core
  DB --> SQLiteFile
  Browser --> CfT
  BrowserClient --> CLI
  CLI -.->|Serves Static UI Assets| Frontend
```

## Architecture directory

Detailed architecture guides live under `docs/architecture/`:

### Monorepo and tool orchestration

- [Monorepo and CLI integration](docs/architecture/monorepo-and-cli.md): Workspace composition, tier ordering, direct source exports, how the codebase combines together, and standalone binary compilation.
- [CLI and loopback daemon architecture](docs/architecture/cli-and-daemon.md): `apps/cli` architecture, Commander command tree, lazy action execution, unified loopback daemon lifecycle, and signal handling.

### Application architectures

- [HTTP API architecture](docs/architecture/api.md): `apps/api` architecture, Hono route factory, in-process mounting, loopback CORS protection, and socketless testing.
- [Frontend application architecture](docs/architecture/frontend.md): `apps/frontend` architecture, Feature-Sliced Design v2.1 layers, App Router adapters, hydration safety, and static asset delivery.
- [Documentation site architecture](docs/architecture/site.md): `site/` platform architecture, Fumadocs MDX content pipeline, search index route, and LLM text endpoints.

### Package architectures

- [Persistence and database architecture](docs/architecture/persistence.md): `packages/db` architecture, embedded SQLite engine, WAL mode, Drizzle ORM schema, and startup migration execution.
- [Browser automation architecture](docs/architecture/browser.md): `packages/browser` architecture, 3-tier Chromium resolution waterfall algorithm, managed Chrome for Testing cache, and binary verification.

## Core runtime lifecycles

### Unified loopback daemon lifecycle (`devtools web`)

```mermaid
sequenceDiagram
  autonumber
  participant User as Developer / Shell
  participant CLI as apps/cli (CLI Entrypoint)
  participant Daemon as apps/cli (Daemon Host)
  participant DB as packages/db (Persistence)
  participant API as apps/api (Hono Router)
  participant UI as apps/frontend (Static Assets)

  User->>CLI: devtools web --port 4000
  CLI->>Daemon: startDaemon({ port, host, staticDir })
  Daemon->>DB: runMigrations(db)
  DB-->>Daemon: Schema migrations applied (WAL mode active)
  Daemon->>API: createApp({ basePath: '/api' })
  Daemon->>Daemon: Bun.serve({ fetch: (req) => API or Static })
  Daemon-->>User: Listening on http://127.0.0.1:4000
  User->>Daemon: GET /api/health
  Daemon->>API: Route to /health
  API-->>User: 200 OK (HealthResponseSchema)
  User->>Daemon: GET /
  Daemon->>UI: Serve index.html & static chunks
  UI-->>User: 200 OK (Dashboard UI)
```

### Chromium waterfall resolution algorithm (`devtools browser`)

```mermaid
flowchart TD
  Start([Resolve Browser Executable]) --> CheckOverride{Explicit Override?<br/>--chrome-path or DEVTOOLS_CHROME_PATH}
  CheckOverride -- Yes --> VerifyOverride[Verify Executable Path & Version]
  VerifyOverride -- Valid --> Found([Return BrowserResolution])
  VerifyOverride -- Invalid --> ErrorOverride[Throw InvalidBrowserPathError]
  CheckOverride -- No --> CheckCache{Managed Cache Probe<br/>~/.devtools/browsers/}
  CheckCache -- Found --> Found
  CheckCache -- Not Found --> CheckProbes{System & Tool Probes<br/>Chrome, Edge, Brave, Playwright}
  CheckProbes -- Found --> Found
  CheckProbes -- Not Found --> TerminalStop[Throw BrowserNotFoundError<br/>Remediation: devtools browser install]
```
