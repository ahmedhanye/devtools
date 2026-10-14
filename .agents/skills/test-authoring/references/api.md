# API application testing

Testing contracts and patterns for `apps/api` (`@devtools/api`).

- **Runner**: `bun:test` via Hono in-memory requests (`app.request`)
- **Scope**: HTTP routes, JSON serialization, middleware, CORS loopback policy.

## Patterns

1. **Endpoint contracts via in-memory requests**: Dispatch HTTP requests directly to `app.request` without opening network ports. Verify HTTP status codes, `content-type` headers, and validate response bodies using `@devtools/core` Zod schemas.
2. **Error routes and schemas**: Verify non-existent paths return HTTP 404, unhandled errors return HTTP 500, and error responses conform strictly to `ApiErrorResponseSchema`.
3. **Security boundaries**: Test loopback origins (`http://localhost:3000`, `http://127.0.0.1:3000`) receive `access-control-allow-origin` headers. Verify external origins receive `null` or are blocked.
4. **Route mounting**: Test that routes mounted with custom `basePath` prefixes respond at expected paths.

## Example

```ts
import { describe, expect, it } from "bun:test";
import { HealthCheckResponseSchema } from "@devtools/core";
import { createApiServer } from "../src/server";

describe("API server contracts", () => {
  const app = createApiServer();

  it("returns health check payload conforming to schema", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const json = await res.json();
    const parsed = HealthCheckResponseSchema.parse(json);
    expect(parsed.status).toBe("ok");
  });

  it("returns 404 with structured error schema on missing route", async () => {
    const res = await app.request("/non-existent-route");
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("applies loopback CORS policy", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );

    const externalRes = await app.request("/health", {
      headers: { Origin: "https://evil.com" },
    });
    expect(externalRes.headers.get("access-control-allow-origin")).toBeNull();
  });
});
```
