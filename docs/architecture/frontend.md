# Frontend application architecture

Feature-Sliced Design (FSD) v2.1 topology, Next.js App Router static export, and Daemon asset delivery for `apps/frontend`.

## Layer topology and delivery flow

```mermaid
flowchart LR
  subgraph FSD ["apps/frontend/src (FSD v2.1 top-down)"]
    App["app/<br/>(App Router Boundary Adapters)"] --> Pages["pages/<br/>(Page compositions)"]
    Pages --> Features["features/<br/>(On demand)"]
    Features --> Entities["entities/<br/>(On demand)"]
    Entities --> Shared["shared/<br/>(UI, lib, api, tokens)"]
  end

  App --> Build["next build<br/>(output: export)"]
  Build --> Dist["apps/frontend/dist"]
  Dist --> Daemon["apps/cli Daemon<br/>(serves /* alongside /api/*)"]
```

| Layer       | Responsibility                                                                                                           | Public boundary             |
| :---------- | :----------------------------------------------------------------------------------------------------------------------- | :-------------------------- |
| `app/`      | Thin App Router Boundary Adapters (`page.next.tsx`, `layout.next.tsx`) declaring metadata and global providers.          | Next.js `pageExtensions`    |
| `pages/`    | Full-page compositions, page-scoped state, and query orchestration (default home per Pages-First Extraction Rule).       | `pages/<slice>/index.ts`    |
| `features/` | Reusable user interactions carrying business value, extracted only when shared across distinct pages.                    | `features/<slice>/index.ts` |
| `entities/` | Reusable domain models and entity cards, extracted only when shared across distinct pages.                               | `entities/<slice>/index.ts` |
| `shared/`   | Reusable UI primitives (`@base-ui/react`), Tailwind `cn`, Semantic Theme Tokens, and Tear-Free Client Hydration helpers. | `shared/<segment>/index.ts` |

## Static export and Daemon delivery

`apps/frontend/next.config.ts` sets `output: "export"`, `distDir: "dist"`, and `pageExtensions: ["next.tsx", "next.ts"]`:

- `bun --filter @devtools/frontend build` compiles static HTML, CSS, and client JS bundles into `apps/frontend/dist`.
- `startDaemon` (`apps/cli/src/commands/web/daemon.ts`) serves these static files on `/*` while mounting `@devtools/api` on `/api/*`, avoiding a separate production Next.js server process.
- `apps/frontend` imports only browser-safe workspace packages (`@devtools/core` and `@devtools/lighthouse/schemas`), enforced by `.fallowrc.json`.

For FSD authoring rules, Storybook Portable Stories, React 19 standards, and Tear-Free Client Hydration hooks, see [Frontend standards](../coding-standards/frontend.md).
