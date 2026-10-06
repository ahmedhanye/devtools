import { describe, expect, test } from "bun:test";
import {
  API_ERROR_CODES,
  ApiErrorResponseSchema,
  HealthResponseSchema,
} from "@devtools/core";
import { app, createApp } from "../src/index";

describe("Health API Endpoint (/api/health)", () => {
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

  test("supports CORS for loopback origins (localhost and 127.0.0.1)", async () => {
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

    const resExternal = await app.request("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(resExternal.headers.get("access-control-allow-origin")).toBeNull();
  });
});
