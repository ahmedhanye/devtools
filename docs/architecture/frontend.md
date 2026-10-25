# Frontend Application Architecture

Architecture, Feature-Sliced Design (FSD) v2.1 structure, Next.js App Router boundary, and hydration boundaries for `apps/frontend`.

## Architectural design and layer hierarchy

`apps/frontend` is a Next.js web dashboard structured according to **Feature-Sliced Design (FSD) v2.1**:

```text
apps/frontend/src/
├── app/                  # Next.js App Router adapters, providers, route entrypoints
├── pages/                # Full-page compositions and page-scoped state
├── features/             # User interactions carrying business value (e.g. browser-install)
├── entities/             # Business domain entities (e.g. service, browser-executable)
└── shared/               # Reusable UI primitives, utility libraries, design system tokens
```

### Layer responsibilities

1. **`app/`**: Thin routing adapters containing layout metadata, global providers, and catch-all routes. Delegates feature presentation immediately to FSD pages in `src/pages/<page>/`.
2. **`pages/`**: Compositional page views uniting features and entities into coherent screens. Holds page-level state and orchestrates queries.
3. **`features/`**: User-driven interactions delivering direct business value (e.g. triggering a browser download or toggling daemon configurations).
4. **`entities/`**: Domain entities representing business models, status cards, and entity stores.
5. **`shared/`**: Reusable UI blocks, Tailwind utility wrappers (`cn`), design tokens, and browser hydration helpers (`useIsMounted`, `useNativeSearchParams`).

### The "Pages First" extraction rule

All UI components, fetching logic, and state management begin inside `src/pages/<page>/`. Logic is extracted to lower layers (`features/`, `entities/`, `shared/`) only when actively reused across distinct pages and serving a focused, single responsibility.

## Static export and daemon delivery

`apps/frontend` operates in static export mode:

- `next.config.ts` sets `output: "export"`.
- During build, Next.js generates static HTML, CSS, and client JavaScript bundles into `apps/frontend/out`.
- The CLI loopback daemon (`startDaemon`) serves these pre-rendered files on root HTTP paths (`/`), enabling single-process deployment without running an active Node/Next.js server in production.

## Hydration safety and browser boundaries

1. **Tear-free client rendering**: Client-only UI subtrees are guarded with `useIsMounted()` from `@/shared/lib`, which uses `useSyncExternalStore` to ensure synchronous, tear-free hydration without layout shifts or re-rendering cascades.
2. **Static search parameter resolution**: Search parameters are accessed via `useNativeSearchParams()` to prevent Next.js from enforcing dynamic server rendering or requiring top-level Suspense boundaries.
3. **Browser global guards**: All invocations of `window`, `document`, and web storage APIs are guarded with `typeof window !== "undefined"` and provide server-safe fallback values.
