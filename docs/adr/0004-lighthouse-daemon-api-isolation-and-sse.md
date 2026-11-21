---
status: accepted
date: 2026-11-11
---

# Lighthouse daemon API isolation, SSE transport, and report sandboxing

Exposing Lighthouse auditing through the local Daemon API uses cooperative `AbortSignal` job cancellation, a two-step `POST` plus `GET` SSE contract, a browser-safe `@devtools/lighthouse/schemas` subpath, all-verb loopback checks, and opaque-origin CSP sandboxing for saved HTML reports.

## Rationale and constraints

- **Cooperative cancellation:** Audit batches accept `AbortSignal` so server shutdown aborts active Chromium runs before closing SQLite handles, preserving single-entry compiled binaries and `:memory:` integration tests.
- **SSE transport split:** Native browser `EventSource` supports only `GET`, `Bun.serve` drops idle connections, and Hono `onError` emits duplicate SSE error frames. Separating job creation (`POST`) from streaming (`GET`), handling stream errors inline, and retaining recent terminal snapshots allows dashboard reloads to recover active or recently finished audits.
- **Schema reuse and report isolation:** Because [ADR 0003](0003-lighthouse-audit-isolation-and-tiered-storage.md) keeps Lighthouse schemas out of `@devtools/core` and the frontend cannot bundle Bun runtime code, `@devtools/lighthouse/schemas` exposes pure Zod schemas while saved HTML Report Artifacts serve under an opaque `null`-origin CSP sandbox rejected by `/api/*` loopback guards across all HTTP verbs.

## Consequences

- Embedded Report Artifact scripts cannot reach Daemon APIs, and route handlers stay decoupled from Lighthouse internals; see [HTTP API architecture](../architecture/api.md) for routes, headers, and status codes.
