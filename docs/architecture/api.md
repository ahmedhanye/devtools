# HTTP API Architecture

Architecture, route design, security boundaries, and validation contracts for `apps/api`.

## Application design and factory pattern

`apps/api` provides HTTP API endpoints implemented with [Hono](https://hono.dev/):

```text
apps/api/
├── src/
│   ├── middleware/
│   │   └── security.ts        # Loopback origin, CORS, & CSRF protection middleware
│   ├── routes/
│   │   └── health.ts          # Health probe & uptime endpoint
│   ├── index.ts               # Hono app factory & middleware registration
│   └── server.ts              # Standalone HTTP server runner
└── tests/                     # Socketless in-memory test suites
```

Instead of exporting an ambient singleton, `apps/api` exposes a factory function:

```ts
export interface CreateAppOptions {
  basePath?: string;
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const app = new Hono();
  const basePath = options.basePath ?? "/api";

  // Register middleware and routes under basePath
  return app;
}
```

This factory enables the CLI loopback daemon to mount routes under `/api` in-process while allowing test suites to instantiate isolated test applications.

## Loopback security and origin protection

Because DevTools operates on developer workstations, `apps/api` enforces loopback isolation:

1. **Host binding**: Listens on `127.0.0.1`, `localhost`, or `[::1]` by default. Never exposes endpoints to public interfaces without explicit user flags.
2. **CORS policy**: Cross-Origin Resource Sharing is locked down to loopback origins (`http://localhost:*`, `http://127.0.0.1:*`, `http://[::1]:*`).
3. **Cross-site request forgery protection**: Verifies request origins on mutating HTTP verbs (POST, PUT, DELETE, PATCH) by rejecting non-loopback `Origin` headers, checking `Sec-Fetch-Site: cross-site`, and requiring explicit JSON content types. This prevents malicious external websites running in the developer's browser from issuing cross-origin commands against the local daemon.

## Request validation and response contracts

1. **Schema validation with Zod**: Incoming query parameters, path variables, and request JSON payloads are validated through Zod schemas defined in `@devtools/core`.
2. **Standardized error envelopes**: Any non-2xx HTTP response formats its body according to `ApiErrorResponseSchema` from `@devtools/core`:
   ```json
   {
     "error": {
       "code": "BAD_REQUEST",
       "message": "Invalid query parameter",
       "details": {}
     }
   }
   ```
3. **Status code discipline**:
   - `200 OK`: Successful read or update.
   - `201 Created`: Successful creation.
   - `400 Bad Request`: Syntax or parsing error.
   - `404 Not Found`: Unknown endpoint or resource.
   - `422 Unprocessable Entity`: Validation failure on input schema.
   - `500 Internal Server Error`: Unhandled internal exception.

## Socketless in-memory testing seam

Hono's Web Fetch API compliance enables in-memory testing via `app.request()`:

- Integration tests invoke HTTP endpoints by passing standard `Request` objects directly to `app.request()`.
- No physical TCP ports are opened, eliminating port contention and reducing test suite execution times to milliseconds.
