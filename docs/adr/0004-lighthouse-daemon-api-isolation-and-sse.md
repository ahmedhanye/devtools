---
status: accepted
date: 2026-11-11
contexts:
  - Performance Auditing
  - Runtime & CLI
  - Frontend & UI
---

# Lighthouse daemon API isolation, SSE transport, and report sandboxing

Exposing Lighthouse auditing through the local daemon API uses cooperative `AbortSignal` job cancellation inside the daemon, a two-step `POST` plus `GET` SSE contract, a browser-safe `@devtools/lighthouse/schemas` subpath, all-verb loopback checks, and opaque-origin CSP sandboxing for saved HTML reports.

## Rationale and constraints

- **Cancellation and compiled-binary parity:** Daemon requests run audit batches in-process per [ADR 0005](0005-in-process-lighthouse-execution.md) and abort active Chromium runs during server shutdown before closing SQLite handles, preserving single-entry compiled binaries and `:memory:` integration tests.
- **SSE resilience:** Native browser `EventSource` supports only `GET`, and `Bun.serve` drops idle connections after 10 seconds while Hono's `onError` emits duplicate SSE error frames; the two-step contract separates job creation from streaming, disables socket timeouts with periodic keepalives, handles errors inside the stream callback, and retains recent terminal snapshots for page reloads.
- **Schema reuse and report isolation:** Because [ADR 0003](0003-lighthouse-audit-isolation-and-tiered-storage.md) keeps Lighthouse schemas out of `@devtools/core` and `apps/frontend` cannot bundle Bun runtime code, `@devtools/lighthouse/schemas` exposes pure Zod schemas while saved `report.html` files serve under an opaque `null`-origin CSP sandbox rejected by `/api/*` loopback guards across all HTTP verbs.

## Consequences

- Dashboard reloads recover active or recently finished audits, embedded report scripts cannot reach daemon APIs, and `apps/cli` owns SQLite lifecycle and static asset serving while `apps/api` remains a DB-free router factory; see [HTTP API Architecture](../architecture/api.md) for routes, headers, and status codes.
