# HTTP API Application Standards

Engineering standards and conventions for the HTTP API application in `apps/api` and in-process API route handlers.

## Framework and application structure

1. **Hono application architecture**: The API is built with [Hono](https://hono.dev/), optimized for minimal overhead, native Bun performance, and standard Web Fetch API compatibility.
2. **Factory-based instantiation**: Export a factory function `createApp(options?: CreateAppOptions)` rather than an ambient singleton. This allows tests and the loopback daemon to instantiate isolated API applications with custom base paths or dependencies:
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
3. **Route segmentation**: Organize endpoints by domain resource in `src/routes/<resource>.ts` (e.g. `health.ts`, `browser.ts`, `services.ts`). Mount routes onto the root application using sub-routers.

## Security and loopback boundaries

1. **Loopback isolation**: As a local developer tool, the API binds to loopback interfaces (`127.0.0.1` or `localhost`) by default. Never bind to public network interfaces (`0.0.0.0`) without explicit user opt-in flags.
2. **CORS policy**: Restrict Cross-Origin Resource Sharing (CORS) to loopback origins. Reject incoming requests with external or unexpected `Origin` headers.
3. **Loopback origin verification middleware**: Verify that mutating requests (POST, PUT, DELETE, PATCH) originate from the local dashboard to protect against Cross-Site Request Forgery (CSRF) from malicious external websites visited in the developer's browser.

## Request and response validation

1. **Zod validation**: Validate all incoming parameters, queries, and request bodies using Zod schemas imported from `@devtools/core`. Reject invalid payloads before executing business logic.
2. **Standardized error envelopes**: All non-2xx HTTP responses must format their JSON payloads according to `ApiErrorResponseSchema` from `@devtools/core`:
   ```json
   {
     "error": {
       "code": "INVALID_PARAMS",
       "message": "Invalid query parameter 'channel': must be one of stable, beta, dev, canary",
       "details": {
         "channel": [
           "Expected 'stable' | 'beta' | 'dev' | 'canary', received 'nightly'"
         ]
       }
     }
   }
   ```
3. **Accurate HTTP status codes**:
   - `200 OK`: Successful read or update operation.
   - `201 Created`: Successful creation of a new entity.
   - `400 Bad Request`: Malformed JSON or syntax failure.
   - `404 Not Found`: Resource does not exist.
   - `422 Unprocessable Entity`: Schema validation error for request fields.
   - `500 Internal Server Error`: Unhandled server-side failure.

## In-memory testing seams

1. **Socketless testing**: Take advantage of Hono's native `app.request()` method to test HTTP endpoints entirely in memory:
   ```ts
   import { describe, expect, it } from "bun:test";
   import { createApp } from "../src";

   describe("GET /api/health", () => {
     it("returns healthy status envelope", async () => {
       const app = createApp({ basePath: "/api" });
       const res = await app.request("/api/health");

       expect(res.status).toBe(200);
       const json = await res.json();
       expect(json.status).toBe("ok");
     });
   });
   ```
   This eliminates the latency, port binding collisions, and teardown overhead of opening physical TCP network sockets during test runs.
