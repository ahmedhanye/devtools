import { describe, expect, test } from "bun:test";
import {
  API_ERROR_CODES,
  ApiErrorResponseSchema,
  HealthResponseSchema,
} from "@devtools/core";
import { app, createApp, formatError, isLoopbackOrigin } from "../src/index";

describe("Health API Endpoint (/api/health) & Security Boundaries", () => {
  test("GET /api/health returns 200 and matches HealthResponseSchema", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const contentType = res.headers.get("content-type");
    expect(contentType).toBeTruthy();
    expect(contentType).toContain("application/json");

    const json = await res.json();
    const parsed = HealthResponseSchema.parse(json);

    expect(parsed.status).toBe("ok");
    expect(parsed.uptime).toBeGreaterThanOrEqual(0);
    expect(typeof parsed.version).toBe("string");
    expect(parsed.version.length).toBeGreaterThan(0);
    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
  });

  test("supports custom basePath via createApp({ basePath: '' })", async () => {
    const rootApp = createApp({ basePath: "" });
    const res = await rootApp.request("/health");
    expect(res.status).toBe(200);

    const json = await res.json();
    const parsed = HealthResponseSchema.parse(json);
    expect(parsed.status).toBe("ok");
  });

  test("returns 404 with ApiErrorResponseSchema on unknown route", async () => {
    const res = await app.request("/api/non-existent-route");
    expect(res.status).toBe(404);

    const json = await res.json();
    const parsed = ApiErrorResponseSchema.parse(json);
    expect(parsed.error.code).toBe(API_ERROR_CODES.NOT_FOUND);
    expect(parsed.error.message).toBeTruthy();
  });

  test("returns 500 with ApiErrorResponseSchema on internal error", async () => {
    const customApp = createApp();
    customApp.get("/test-error", () => {
      throw new Error("Simulated failure");
    });

    const res = await customApp.request("/api/test-error");
    expect(res.status).toBe(500);

    const json = await res.json();
    const parsed = ApiErrorResponseSchema.parse(json);
    expect(parsed.error.code).toBe(API_ERROR_CODES.INTERNAL_ERROR);
    expect(parsed.error.message).toBe("Simulated failure");
  });

  test("supports CORS for loopback origins (localhost, 127.0.0.1, and [::1])", async () => {
    const resLocalhost = await app.request("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(resLocalhost.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );

    const resLoopbackIp = await app.request("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(resLoopbackIp.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:5173",
    );

    const resIpv6Loopback = await app.request("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "http://[::1]:4000",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(resIpv6Loopback.headers.get("access-control-allow-origin")).toBe(
      "http://[::1]:4000",
    );

    const resExternal = await app.request("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(resExternal.headers.get("access-control-allow-origin")).toBeNull();
    expect(isLoopbackOrigin("not-a-valid-url")).toBe(false);
    expect(isLoopbackOrigin("ftp://localhost:21")).toBe(false);
  });

  test("enforces CSRF and loopback origin verification on mutating verbs", async () => {
    const customApp = createApp();
    customApp.post("/mutate", async (c) => {
      const body = await c.req.json().catch(() => null);
      return c.json({ ok: true, received: body }, 200);
    });
    customApp.delete("/mutate", (c) => c.json({ ok: true }, 200));

    // 1. Rejects Sec-Fetch-Site: cross-site
    const crossSiteRes = await customApp.request("/api/mutate", {
      method: "POST",
      headers: {
        "Sec-Fetch-Site": "cross-site",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ test: 1 }),
    });
    expect(crossSiteRes.status).toBe(403);
    const crossSiteErr = ApiErrorResponseSchema.parse(
      await crossSiteRes.json(),
    );
    expect(crossSiteErr.error.code).toBe(API_ERROR_CODES.FORBIDDEN);

    // 2. Rejects non-loopback Origin header
    const badOriginRes = await customApp.request("/api/mutate", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ test: 1 }),
    });
    expect(badOriginRes.status).toBe(403);
    const badOriginErr = ApiErrorResponseSchema.parse(
      await badOriginRes.json(),
    );
    expect(badOriginErr.error.code).toBe(API_ERROR_CODES.FORBIDDEN);

    // 3. Rejects non-JSON Content-Type when body is present
    const formContentRes = await customApp.request("/api/mutate", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:4000",
        "Content-Type": "text/plain",
        "Content-Length": "11",
      },
      body: "hello=world",
    });
    expect(formContentRes.status).toBe(415);
    const formContentErr = ApiErrorResponseSchema.parse(
      await formContentRes.json(),
    );
    expect(formContentErr.error.code).toBe(
      API_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
    );

    // 3b. Rejects loose application/json parameter spoofing
    const spoofedContentRes = await customApp.request("/api/mutate", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:4000",
        "Content-Type": "text/plain; note=application/json",
      },
      body: "payload",
    });
    expect(spoofedContentRes.status).toBe(415);

    // 3c. Rejects non-JSON body constructed without explicit Content-Length header
    const noLengthRes = await customApp.request("/api/mutate", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:4000",
        "Content-Type": "text/plain",
      },
      body: "payload",
    });
    expect(noLengthRes.status).toBe(415);

    // 4. Accepts valid loopback JSON POST
    const validRes = await customApp.request("/api/mutate", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:4000",
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
        "Content-Length": "10",
      },
      body: JSON.stringify({ test: 1 }),
    });
    expect(validRes.status).toBe(200);

    // 5. Accepts mutating request without body
    const emptyBodyRes = await customApp.request("/api/mutate", {
      method: "DELETE",
      headers: {
        Origin: "http://127.0.0.1:4000",
        "Sec-Fetch-Site": "same-origin",
      },
    });
    expect(emptyBodyRes.status).toBe(200);
  });

  test("formatError includes optional details when provided", () => {
    const err = formatError(API_ERROR_CODES.BAD_REQUEST, "Invalid field", {
      field: "port",
    });
    expect(err.error.details).toEqual({ field: "port" });
  });
});
