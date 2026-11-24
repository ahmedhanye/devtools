---
status: accepted
date: 2026-11-22
---

# Static-export query-parameter routing for runtime entities

Frontend detail and comparison views in `apps/frontend` use static routes paired with query parameters (`/lighthouse/run?id=<runId>&tab=summary|report`, `/lighthouse/run?job=<jobId>`, `/lighthouse/compare?runs=<ids>&baseline=<id>`) instead of dynamic Next.js `[id]` route segments. Client components read and mutate query state through `useNativeSearchParams()` and `updateNativeSearchParams()` in `apps/frontend/src/shared/lib`.

## Rationale and constraints

- **Static export constraint:** `apps/frontend/next.config.ts` compiles with `output: "export"` so the `apps/cli` Bun Daemon serves static HTML and assets directly on `/*` without a production Next.js server. Audit Run IDs and transient Audit Job IDs are created dynamically at runtime in SQLite and memory, so Next.js cannot enumerate them ahead of time via `generateStaticParams()`.
- **SPA rewrite pitfalls avoided:** Mounting catch-all dynamic routes with static HTML rewrites blurs server 404 semantics for unknown static assets and complicates deep-link hydration. Flat static HTML entry points (`lighthouse.html`, `lighthouse/compare.html`, `lighthouse/run.html`) resolve deterministically under `startDaemon`.
- **Suspense-free client reactivity:** Next.js `useSearchParams()` opts static routes into client-rendering bailout errors unless wrapped in `<Suspense>`, causing hydration flashes. Reading `window.location.search` via `useSyncExternalStore` inside `useNativeSearchParams()` preserves immediate SSR HTML parity while `updateNativeSearchParams()` synchronously dispatches same-route `history.pushState`/`history.replaceState` notifications.

## Consequences

- Never introduce dynamic `[id]` App Router segments in `apps/frontend/src/app/` while `output: "export"` is enabled.
- Same-route state transitions (live `?job=` replacing to `?id=`, switching `?tab=`, or updating Compare Builder `?runs=` and `?baseline=`) call `updateNativeSearchParams()` rather than relying solely on Next.js router mutations.
- See [Frontend application architecture](../architecture/frontend.md) and [Frontend application standards](../coding-standards/frontend.md) for usage rules.
