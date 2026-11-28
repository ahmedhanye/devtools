# Monorepo architecture

At-a-glance map of workspaces, folder ownership, dependency boundaries, and direct TypeScript source exports across the DevTools Bun monorepo.

## Workspace composition

DevTools partitions code into three tiers linked via Bun workspace references (`"workspace:*"`):

| Tier             | Directory             | Package                | Hosts                                                                                        |
| :--------------- | :-------------------- | :--------------------- | :------------------------------------------------------------------------------------------- |
| **Applications** | `apps/cli`            | `@devtools/cli`        | CLI commands, programmatic CLI seams, Daemon host, lazy DB wiring, and binary entrypoint.    |
| **Applications** | `apps/api`            | `@devtools/api`        | In-process Hono HTTP API (`/api/*`), loopback security middleware, and `DbHandle` wiring.    |
| **Applications** | `apps/frontend`       | `@devtools/frontend`   | Next.js App Router dashboard (FSD v2.1) exported as static assets for the Daemon.            |
| **Packages**     | `packages/core`       | `@devtools/core`       | Browser-safe platform schemas and errors (`.`) plus Node/Bun host utilities (`./node`).      |
| **Packages**     | `packages/db`         | `@devtools/db`         | Embedded SQLite (`bun:sqlite`) `DbSession`/`DbHandle` lifecycle and Drizzle schemas.         |
| **Packages**     | `packages/browser`    | `@devtools/browser`    | Chromium Browser Resolution Waterfall, Managed Browser Cache, and Chrome launcher.           |
| **Packages**     | `packages/lighthouse` | `@devtools/lighthouse` | In-process Lighthouse engine, `AuditJobManager`, `./schemas`, and 3-tier persistence.        |
| **Site**         | `site`                | `@devtools/site`       | Product Docs website built with Fumadocs (`site/content/docs/**`) and `/llms.txt` endpoints. |

Repository tooling lives outside workspace packages under `scripts/` (coverage, diff coverage, secret scanning, agent governance, migration checks), `.github/` (CI and release workflows), and Engineering Docs in root `*.md` and `docs/` (architecture guides, ADRs, coding standards, testing, review, contributing guides, and `GLOSSARY.md`).

Engineering Docs (`root *.md`, `docs/**`, workspace `README.md`) cover internal architecture, standards, and contributor workflows. Product Docs (`site/content/docs/**`) cover public tutorials, how-to guides, references, and explanations for DevTools users, and do not duplicate contributor internals.

## Component interaction model

```mermaid
graph TD
  subgraph Applications ["apps/* and site/"]
    CLI["apps/cli<br/>(CLI and Daemon)"]
    API["apps/api<br/>(Hono HTTP API)"]
    Frontend["apps/frontend<br/>(Next.js Dashboard)"]
    Site["site/<br/>(Fumadocs Docs)"]
  end

  subgraph Packages ["packages/* (Headless Domain Packages)"]
    Core["packages/core<br/>(Platform Schemas, Errors)"]
    CoreNode["packages/core/node<br/>(Teardown, Signals, Workspace)"]
    DB["packages/db<br/>(DbSession, DbHandle, Drizzle)"]
    Browser["packages/browser<br/>(Chromium Waterfall, Cache)"]
    LighthouseSchemas["packages/lighthouse/schemas<br/>(Browser-Safe Zod Schemas)"]
    Lighthouse["packages/lighthouse<br/>(LighthouseStore, AuditJobManager)"]
  end

  subgraph External ["External and Local Boundaries"]
    SQLiteFile[("SQLite DB<br/>(~/.devtools/devtools.db)")]
    CfT[("Chrome for Testing<br/>(~/.devtools/browsers/)")]
    Artifacts[("Report Artifacts<br/>(~/.devtools/artifacts/)")]
    BrowserClient["Developer Web Browser"]
  end

  CLI --> API
  CLI --> Core
  CLI --> CoreNode
  CLI --> DB
  CLI --> Browser
  CLI --> Lighthouse
  CLI --> LighthouseSchemas
  API --> Core
  API --> CoreNode
  API --> DB
  API --> Lighthouse
  API --> LighthouseSchemas
  Frontend --> Core
  Frontend --> LighthouseSchemas
  DB --> Core
  DB --> CoreNode
  DB --> SQLiteFile
  Browser --> Core
  Browser --> CoreNode
  Browser --> CfT
  Lighthouse --> Core
  Lighthouse --> CoreNode
  Lighthouse --> DB
  Lighthouse --> Browser
  Lighthouse --> LighthouseSchemas
  Lighthouse --> Artifacts
  BrowserClient --> CLI
  CLI -.->|Serves Static UI Assets| Frontend
```

## Dependency boundaries

Workspace-level and module-level boundaries are enforced mechanically across two complementary layers:

- **Workspace package boundaries (`bun run boundaries`).** `turbo boundaries` verifies that no workspace imports undeclared phantom dependencies or escapes its directory via relative paths, reinforced at install time by `linker = "isolated"` in [`bunfig.toml`](../../bunfig.toml).
- **Intra-package architectural zones (`bun run fallow:arch`).** [`.fallowrc.json`](../../.fallowrc.json) enforces fine-grained module layering:

1. **Unidirectional package hierarchy.** Headless packages (`packages/*`) never import from `apps/*` or `site/`.
2. **Browser-safe vs. Node/Bun subpaths.** `@devtools/core` (`.`) and `@devtools/lighthouse/schemas` depend on zero Node/Bun APIs so `apps/frontend` imports only pure Zod schemas and types. Host utilities (`createTeardown`, `attachHostSignals`, `findWorkspaceRoot`, `isStandaloneRuntime`) live under `@devtools/core/node`.
3. **Composition-root database ownership.** Only application composition roots (`apps/cli/src/app/**`, `apps/cli/src/daemon/**`, `apps/api/src/app/**`) import `@devtools/db` to open and close `DbHandle` lifecycles. Route modules (`apps/api/src/modules/*`) and all CLI command slices (`apps/cli/src/commands/*`) remain DB-free, and feature packages (`@devtools/lighthouse`) receive borrowed read/write-only `DbSession` handles without `close()`.
4. **Isolated sibling apps.** `apps/api` and `apps/frontend` never cross-import source files; `apps/cli` mounts `@devtools/api` in-process (the one documented app-to-app exception, enforced by `.fallowrc.json`) and serves pre-built `apps/frontend/dist` static assets.
5. **Module layering inside workspaces.** `packages/lighthouse` isolates `contracts/`, `domain/`, `application/`, `config/`, and `infra/` behind explicit subpath exports (`./schemas`, `./contracts`, `./domain`, `./application`, `./config`, `./serializers`, `./wiring`); `apps/api` and `apps/cli` isolate vertical slices (`app/` -> `modules/` or `commands/` -> `shared/`, plus `daemon/` in `apps/cli`) with `publicFiles` enforcement in `.fallowrc.json`; `apps/frontend` enforces FSD v2.1 layers via `bun run lint:fsd`.

## Buildless development and direct source exports

Internal packages declare direct TypeScript source exports in `package.json` (for example `"."` and `"./node"` on `@devtools/core`, and explicit concern subpaths on `@devtools/lighthouse`) pointing to `./src/*.ts` with `"sideEffects": false` on pure packages. Combined with `moduleResolution: "bundler"` in [`tsconfig.base.json`](../../tsconfig.base.json), consuming workspaces resolve TypeScript source directly with no intermediate package build step, while workspace-specific Turborepo rules live in co-located `turbo.json` files extending the root [`turbo.json`](../../turbo.json) via `"extends": ["//"]`.

For CLI command orchestration, Daemon lifecycles, and standalone binary compilation, see [CLI and Daemon architecture](cli-and-daemon.md).
