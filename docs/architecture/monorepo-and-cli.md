# Monorepo and CLI Integration Architecture

How the DevTools monorepo workspaces, headless packages, and CLI tool combine together into a unified developer tooling system.

## Monorepo topology and workspace composition

DevTools is organized as a Bun monorepo partitioning code into three functional tiers:

```text
devtools/
├── apps/                         # Deployable applications & runtime hosts
│   ├── cli/                      # Developer CLI & unified loopback daemon host
│   ├── api/                      # In-process Hono HTTP API server & route handlers
│   └── frontend/                 # Next.js web dashboard (FSD v2.1 architecture)
├── packages/                     # Shared headless domain packages
│   ├── core/                     # Shared Zod schemas, domain models, error constants
│   ├── db/                       # Embedded SQLite persistence, Drizzle ORM, migrations
│   ├── browser/                  # Chromium resolution waterfall & managed cache
│   └── lighthouse/               # Isolated Lighthouse audit engine & normalizer
└── site/                         # Fumadocs documentation platform & LLM endpoints
```

Consuming workspaces reference internal packages via Bun workspace protocols (`"workspace:*"`).

## Dependency topology and tier ordering

The monorepo enforces a strict unidirectional dependency graph:

```mermaid
graph TD
  subgraph Applications ["apps/* & site/"]
    CLI["apps/cli<br/>(CLI & Daemon)"]
    API["apps/api<br/>(Hono HTTP API)"]
    Frontend["apps/frontend<br/>(Next.js Dashboard)"]
    Site["site/<br/>(Fumadocs Docs)"]
  end

  subgraph Packages ["packages/* (Headless Domain Packages)"]
    Browser["packages/browser<br/>(Chromium Waterfall)"]
    DB["packages/db<br/>(SQLite / Drizzle)"]
    Core["packages/core<br/>(Platform Schemas & Errors)"]
    LighthouseSchemas["packages/lighthouse/schemas<br/>(Browser-Safe Zod Schemas)"]
    Lighthouse["packages/lighthouse<br/>(Lighthouse Audit Engine)"]
  end

  CLI --> API
  CLI --> Core
  CLI --> DB
  CLI --> Browser
  CLI --> Lighthouse
  CLI --> LighthouseSchemas
  API --> Core
  API --> DB
  API --> Lighthouse
  API --> LighthouseSchemas
  Frontend --> Core
  Frontend --> LighthouseSchemas
  DB --> Core
  Browser --> Core
  Lighthouse --> Core
  Lighthouse --> DB
  Lighthouse --> Browser
  Lighthouse --> LighthouseSchemas
```

### Architectural tier invariants

1. **Headless domain packages (`packages/*`)**:
   - Leaf foundation: `@devtools/core` has zero workspace dependencies and declares cross-cutting platform Zod schemas (`health`, `config`, `errors`), error constants (`API_ERROR_CODES`), and environment map types.
   - Browser-safe domain contracts: `@devtools/lighthouse/schemas` (`packages/lighthouse/src/schemas.ts`) depends only on `zod` (zero Node/Bun, SQLite, or Chromium imports), enabling both backend services and `apps/frontend` to share domain DTO and SSE schemas safely.
   - Persistence and automation: `@devtools/db` and `@devtools/browser` consume `@devtools/core`.
   - Performance auditing: `@devtools/lighthouse` consumes `@devtools/core`, `@devtools/db`, `@devtools/browser`, and `@devtools/lighthouse/schemas`.
   - Invariant: Packages must **never** import from applications (`apps/*`) or documentation (`site/`).
2. **Deployable applications (`apps/*`)**:
   - Applications consume headless packages via `"workspace:*"` (`apps/api` consumes `@devtools/core`, `@devtools/db`, and `@devtools/lighthouse`; `apps/frontend` is restricted to `@devtools/core` and `@devtools/lighthouse/schemas` via `.fallowrc.json`).
   - Sibling applications (`apps/api`, `apps/frontend`) remain siloed; they never cross-import source files directly.
3. **Buildless development with direct source exports**:
   - Internal packages declare direct source exports in `package.json` (`"exports": { ".": "./src/index.ts" }`, plus `"./schemas": "./src/schemas.ts"` on `@devtools/lighthouse`).
   - Combined with `moduleResolution: "bundler"`, applications resolve TypeScript source files directly without intermediate compilation lag.

## CLI integration and runtime orchestration

`apps/cli` serves as the primary system orchestrator, bridging terminal commands, background services, and web interfaces:

1. **Binary entrypoint to library seam**:
   - The executable `apps/cli/bin/devtools.js` contains a 4-line shebang delegating directly to `runCli()` in `src/cli.ts`.
   - All commands, program builders, and daemon lifecycles are exported programmatically from `src/index.ts`, enabling test suites to invoke CLI logic in-process.
2. **Synchronous metadata and lazy action execution**:
   - Commander.js registers command structures and options synchronously, ensuring `--help` cold starts in under 20ms.
   - Heavy execution logic (SQLite initialization, Chromium downloading, server startup) is dynamically imported only when a specific command action runs.
3. **Unified loopback daemon host**:
   - Rather than requiring multiple processes or ports, running `devtools web` delegates to `@devtools/api`'s shared `startServer` bootstrap to start a single Bun HTTP daemon process.
   - The bootstrap runs SQLite migrations, mounts the in-process Hono API application on `/api/*` (forwarding `{ server }` bindings for peer IP checks and SSE timeouts), and serves pre-rendered Next.js frontend static assets via `fallbackFetch` on all other paths.
4. **Standalone binary compilation**:
   - For distribution without requiring a local Bun installation, multi-entrypoint compilation (`bun build apps/cli/bin/devtools.js apps/api/src/lighthouse/worker.ts --compile --outfile dist/devtools`) produces a self-contained single-file executable embedding the Bun engine, bytecode, CLI entrypoint, and background Lighthouse `Worker`.

For deep details on daemon startup lifecycles, graceful shutdown, and CLI testing seams, consult [CLI and Daemon Architecture](docs/architecture/cli-and-daemon.md).
