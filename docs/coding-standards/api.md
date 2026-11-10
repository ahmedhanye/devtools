# HTTP API Application Standards

Engineering standards and conventions for the HTTP API application in `apps/api` and in-process API route handlers.

## Framework and application structure

1. **Hono application architecture**: The API is built with [Hono](https://hono.dev/), optimized for minimal overhead, native Bun performance, and standard Web Fetch API compatibility.
2. **Factory-based instantiation**: Export a factory function `createApp(options?: CreateAppOptions)` rather than an ambient singleton. This allows programmatic callers and the loopback daemon to instantiate isolated API applications with custom base paths or dependencies:
   ```ts
   import { Hono } from "hono";

   export interface CreateAppOptions {
     basePath?: string;
   }

   export function createApp(options: CreateAppOptions = {}): Hono {
     const app = new Hono();
     const base = options.basePath ?? "/api";
     // Register routes under base path
     return app;
   }
   ```
3. **Route segmentation**: Organize endpoints by domain resource in `src/routes/<resource>.ts` (e.g. `health.ts`, `lighthouse.ts`). Mount routes onto the root application using sub-routers.

## Security and loopback boundaries

1. **Loopback isolation**: As a local developer tool, the API binds to loopback interfaces (`127.0.0.1`, `localhost`, or `[::1]`) by default. Never bind to public network interfaces (`0.0.0.0`) without explicit user opt-in flags.
2. **CORS policy**: Restrict Cross-Origin Resource Sharing (CORS) to loopback origins. Reject incoming requests with external or unexpected `Origin` headers.
3. **CSRF, cross-site & loopback peer verification middleware**: CORS prevents unauthorized browsers from reading response bodies, but does not block cross-origin requests (such as `POST` requests sent with `mode: "no-cors"`, HTML form posts, or cross-site `GET` / SSE / report requests) from interacting with local daemon endpoints. The API must verify request security boundaries across **all** `/api/*` HTTP methods:
   - Verify the socket peer IP via `server.requestIP(req)` is loopback (or a local host network interface on loopback-bound servers) when a live `Bun.serve` binding is present.
   - Reject any request where the `Origin` header is present (including opaque `"null"` origins from sandboxed iframes) and does not resolve to a loopback address (`http://localhost:*`, `http://127.0.0.1:*`, `http://[::1]:*`, `http://[::ffff:127.0.0.1]:*`).
   - Inspect `Sec-Fetch-Site` when available and deny `cross-site` requests across all HTTP verbs (including `GET` and SSE).
   - Enforce explicit `Content-Type: application/json` on mutating HTTP verbs (`POST`, `PUT`, `DELETE`, `PATCH`) carrying request bodies to prevent simple cross-origin form submissions.
4. **Host header loopback validation (DNS rebinding protection)**: To protect loopback endpoints against DNS rebinding attacks where an external domain resolves to `127.0.0.1`, the loopback security middleware validates the `Host` header across all `/api/*` requests. If a `Host` header is provided, it must resolve to a valid loopback hostname (`localhost`, `127.0.0.1`, `[::1]`, `::1`, `[::ffff:127.0.0.1]`, or `::ffff:127.0.0.1`, with optional port). Requests with external `Host` headers are rejected with `403 Forbidden` (`ApiErrorResponseSchema`).

## Request and response validation

1. **Zod validation**: Validate all incoming parameters, queries, and request bodies using Zod schemas imported from `@devtools/core` (for cross-cutting platform/error envelopes) or the owning domain package's pure browser-safe schema subpath (such as `@devtools/lighthouse/schemas` per [ADR 0003](../adr/0003-lighthouse-audit-isolation-and-tiered-storage.md) and [ADR 0004](../adr/0004-lighthouse-daemon-api-isolation-and-sse.md)). Reject invalid payloads before executing business logic.
2. **Standardized error envelopes**: All non-2xx HTTP responses must format their JSON payloads according to `ApiErrorResponseSchema` from `@devtools/core`:
   ```json
   {
     "error": {
       "code": "VALIDATION_ERROR",
       "message": "Invalid query parameter 'formFactor': must be 'mobile' or 'desktop'",
       "details": {
         "fieldErrors": {
           "formFactor": [
             "Invalid option: expected one of \"mobile\"|\"desktop\""
           ]
         }
       }
     }
   }
   ```
3. **Accurate HTTP status codes**:
   - `200 OK`: Successful read or update operation.
   - `201 Created`: Successful creation of a new entity.
   - `202 Accepted`: Asynchronous background job accepted (e.g. `POST /api/lighthouse/audits`).
   - `400 Bad Request`: Malformed JSON or syntax failure.
   - `403 Forbidden`: Request blocked by loopback protection or cross-site request security policy.
   - `404 Not Found`: Resource does not exist.
   - `409 Conflict`: Concurrent single-flight conflict or ambiguous short-ID prefix.
   - `415 Unsupported Media Type`: Payload missing required `application/json` Content-Type on mutating verbs.
   - `422 Unprocessable Entity`: Schema validation error for request fields or query parameters (`VALIDATION_ERROR`).
   - `500 Internal Server Error`: Unhandled server-side failure.
