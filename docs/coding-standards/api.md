# HTTP API application standards

Authoring rules for Hono routes, factories, Zod validation, and error envelopes in `apps/api`. For mounted routes, loopback security boundaries, SSE transport, and the complete HTTP status code contract, see [HTTP API architecture](../architecture/api.md).

## Application factory and slice structure

- **Factory instantiation.** Export `createApp(options?: CreateAppOptions)` from `apps/api/src/app/create-app.ts` rather than an ambient singleton so the Daemon and socketless tests instantiate isolated apps with custom stores, `db` (`DbSession`), `signal`, and `env` seams:
  ```ts
  export function createApp(options: CreateAppOptions = {}) {
    const app = new Hono<{ Bindings: ApiBindings }>();
    const basePath = options.basePath ?? "/api";
    // Mount security middleware, module routes, and cooperative shutdown()
    return Object.assign(app, { shutdown });
  }
  ```
- **Vertical module slices.** Group endpoints by domain resource under `apps/api/src/modules/<module>/routes.ts` (for example, `health/routes.ts`, `lighthouse/routes.ts`), expose each slice through `index.ts`, and mount routers in `apps/api/src/app/create-app.ts`.
- **Composition-root `@devtools/db` boundary.** Only `apps/api/src/app/**` may open or close `@devtools/db` `DbHandle` instances. Keep `apps/api/src/modules/*` DB-free and access persistence strictly through `LighthouseStore` (`createLighthouseStore` over a borrowed `DbSession`) and `AuditJobManager` from `@devtools/lighthouse`.

## Security boundary discipline

Route all `/api/*` endpoints through the shared loopback guard in `apps/api/src/shared/security/middleware.ts` (peer IP, `Host`, `Origin`, `Sec-Fetch-Site`, and JSON `Content-Type`). Never bypass this middleware on `GET`, SSE, or report routes. See [Loopback security boundary](../architecture/api.md#loopback-security-boundary) for exact rules.

## Validation and error envelopes

- **Schema-first parsing.** Validate params, queries, and bodies before running domain logic using Zod schemas from `@devtools/core` or the owning domain package's browser-safe schema subpath (`@devtools/lighthouse/schemas`).
- **Standardized error responses.** Emit all non-2xx responses via `apps/api/src/shared/http/error-envelope.ts` conforming to `ApiErrorResponseSchema`:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid query parameter 'formFactor': must be 'mobile' or 'desktop'",
      "details": { "fieldErrors": { "formFactor": ["..."] } }
    }
  }
  ```
- **Accurate status codes.** Map every error code (`BAD_REQUEST`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNSUPPORTED_MEDIA_TYPE`, `VALIDATION_ERROR`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`) to its matching HTTP status per [HTTP status and error contracts](../architecture/api.md#http-status-and-error-contracts).
