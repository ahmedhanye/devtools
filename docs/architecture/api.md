# HTTP API Architecture

Architecture, route design, security boundaries, and validation contracts for `apps/api`.

## Application design and factory pattern

`apps/api` provides HTTP API endpoints implemented with [Hono](https://hono.dev/):

```text
apps/api/
├── src/
│   ├── lighthouse/
│   │   ├── job-manager.ts     # Single-flight Audit Job registry, SSE replay & persistence
│   │   ├── worker-handler.ts  # Worker IPC dispatcher & error serializer
│   │   ├── worker-runner.ts   # Bun Worker orchestrator seam
│   │   └── worker.ts          # Dedicated Bun Worker entrypoint (multi-entry compiled)
│   ├── middleware/
│   │   └── security.ts        # All-verb loopback peer, Host, Origin & CSRF protection
│   ├── routes/
│   │   ├── health.ts          # Health probe & uptime endpoint
│   │   └── lighthouse.ts      # Audit triggers, SSE progress, runs, diff & sandboxed HTML
│   ├── app.ts                 # Hono app factory & middleware registration
│   ├── index.ts               # Public API package exports
│   └── server.ts              # Unified DB + Bun.serve bootstrap reused by startDaemon
└── tests/                     # Socketless in-memory, Worker, and HTTP lifecycle suites
```

Instead of exporting an ambient singleton, `apps/api` exposes a factory function:

```ts
export interface CreateAppOptions {
  basePath?: string;
  db?: DevtoolsDb;
  env?: EnvMap;
  artifactsDir?: string;
  auditRunner?: LighthouseAuditRunner;
  jobRetentionMs?: number;
  keepaliveIntervalMs?: number;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<{ Bindings: ApiBindings }>();
  const basePath = options.basePath ?? "/api";

  // Register middleware and routes under basePath
  return app;
}
```

This factory enables the CLI loopback daemon to mount routes under `/api` in-process while allowing test suites to instantiate isolated test applications with injected `:memory:` SQLite databases and fast audit runners.

## Loopback security and origin protection

Because DevTools operates on developer workstations, `apps/api` enforces loopback isolation:

1. **Host binding**: Listens on `127.0.0.1`, `localhost`, or `[::1]` by default. Never exposes endpoints to public interfaces without explicit user flags.
2. **CORS policy**: Cross-Origin Resource Sharing is locked down to loopback origins (`http://localhost:*`, `http://127.0.0.1:*`, `http://[::1]:*`, `http://[::ffff:127.0.0.1]:*`).
3. **All-verb cross-site & peer IP protection**: Verifies socket peer IP via `server.requestIP(req)` (recognizing IPv4, IPv6, IPv4-mapped `[::ffff:127.0.0.1]`, and container-local host interface NAT on loopback servers), validates `Host` headers, rejects `Sec-Fetch-Site: cross-site` and non-loopback or opaque `"null"` `Origin` headers across **all** `/api/*` verbs (including `GET`, SSE streams, and `report.html`), and requires `Content-Type: application/json` on mutating payloads.

## Request validation and response contracts

1. **Schema validation with Zod**: Cross-cutting envelopes (`HealthResponseSchema`, `ApiErrorResponseSchema`, `API_ERROR_CODES`) live in `@devtools/core`, while domain-specific API/SSE request and DTO schemas live in their owning domain package's browser-safe subpath (such as `@devtools/lighthouse/schemas` per [ADR 0003](../adr/0003-lighthouse-audit-isolation-and-tiered-storage.md) and [ADR 0004](../adr/0004-lighthouse-daemon-api-isolation-and-sse.md)).
2. **Standardized error envelopes**: Any non-2xx HTTP response formats its body according to `ApiErrorResponseSchema` from `@devtools/core`:
   ```json
   {
     "error": {
       "code": "VALIDATION_ERROR",
       "message": "Invalid query parameter",
       "details": {}
     }
   }
   ```
3. **Status code discipline**:
   - `200 OK`: Successful read or update.
   - `201 Created`: Successful creation.
   - `202 Accepted`: Asynchronous background job triggered (e.g. Audit Job).
   - `400 Bad Request`: Malformed JSON or syntax error.
   - `403 Forbidden`: Loopback or cross-site boundary violation.
   - `404 Not Found`: Unknown endpoint or missing resource.
   - `409 Conflict`: Single-flight concurrency conflict or ambiguous run prefix.
   - `415 Unsupported Media Type`: Non-JSON request body on mutating verb.
   - `422 Unprocessable Entity`: Validation failure on input schema.
   - `500 Internal Server Error`: Unhandled internal exception.

## Socketless in-memory testing seam

Hono's Web Fetch API compliance enables in-memory testing via `app.request()`:

- Integration tests invoke HTTP endpoints by passing standard `Request` objects directly to `app.request()`.
- No physical TCP ports are opened, eliminating port contention and reducing test suite execution times to milliseconds.
