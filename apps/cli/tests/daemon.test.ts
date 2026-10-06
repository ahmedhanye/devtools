import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ApiErrorResponseSchema, HealthResponseSchema } from "@devtools/core";
import { db, resetDb, systemMetadata } from "@devtools/db";
import {
  type DaemonInstance,
  resolveDaemonConfig,
  resolveStaticDir,
  serveStaticAsset,
  startDaemon,
} from "../src/daemon";

describe("Unified Loopback Daemon Lifecycle and Routing", () => {
  let activeDaemon: DaemonInstance | null = null;

  afterEach(async () => {
    if (activeDaemon) {
      await activeDaemon.stop();
      activeDaemon = null;
    }
    resetDb();
  });

  test("initializes persistence database migrations on daemon startup", async () => {
    resetDb();
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const records = await db.select().from(systemMetadata);
    expect(Array.isArray(records)).toBe(true);
  });

  test("boots on ephemeral port 0 and co-locates static assets and API routes", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    expect(activeDaemon.port).toBeGreaterThan(0);
    expect(activeDaemon.hostname).toBe("127.0.0.1");

    const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;

    // 1. Static asset: GET / serves index.html
    const indexRes = await fetch(`${baseUrl}/`);
    expect(indexRes.status).toBe(200);
    expect(indexRes.headers.get("content-type")).toContain("text/html");
    const indexHtml = await indexRes.text();
    expect(indexHtml).toContain("<!DOCTYPE html>");

    // 2. In-process API: GET /api/health routes to API service
    const healthRes = await fetch(`${baseUrl}/api/health`);
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get("content-type")).toContain("application/json");
    const healthJson = await healthRes.json();
    const validatedHealth = HealthResponseSchema.parse(healthJson);
    expect(validatedHealth.status).toBe("ok");

    // 3. In-process API 404: GET /api/nonexistent returns validated error response
    const apiNotFoundRes = await fetch(`${baseUrl}/api/nonexistent`);
    expect(apiNotFoundRes.status).toBe(404);
    const apiNotFoundJson = await apiNotFoundRes.json();
    const validatedError = ApiErrorResponseSchema.parse(apiNotFoundJson);
    expect(validatedError.error.code).toBe("NOT_FOUND");
  });

  test("serves clean paths without requiring .html extension", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;

    // Frontend export contains _not-found.html
    const res = await fetch(`${baseUrl}/_not-found`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("serves 404.html with status 404 for unmatched static routes", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;

    const res = await fetch(`${baseUrl}/some/nonexistent/page`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("404");
  });

  test("blocks path traversal attempts with 403 Forbidden", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const res = await serveStaticAsset(
      activeDaemon.staticDir,
      "/../../package.json",
    );
    expect(res.status).toBe(403);
  });

  test("blocks sibling directory traversal attempts with 403 Forbidden", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const res = await serveStaticAsset(
      activeDaemon.staticDir,
      "/../dist-sibling/something.html",
    );
    expect(res.status).toBe(403);
  });

  test("rejects non-GET/HEAD methods on static assets with 405 Method Not Allowed", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;

    const res = await fetch(`${baseUrl}/index.html`, { method: "POST" });
    expect(res.status).toBe(405);
  });

  test("supports HEAD requests on static assets", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;

    const res = await fetch(`${baseUrl}/`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("gracefully stops daemon and rejects subsequent connections", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const port = activeDaemon.port;

    const initialRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(initialRes.status).toBe(200);

    await activeDaemon.stop();
    activeDaemon = null;

    expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
  });

  test("serves from custom static directory when provided", async () => {
    const tmpDir = join(__dirname, ".tmp-static");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, "index.html"),
      "<!DOCTYPE html><html><body>Custom Static</body></html>",
    );

    try {
      activeDaemon = startDaemon({
        port: 0,
        host: "127.0.0.1",
        staticDir: tmpDir,
      });

      const res = await fetch(`http://127.0.0.1:${activeDaemon.port}/`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Custom Static");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("fails fast with actionable error message when static directory does not exist", () => {
    expect(() => {
      startDaemon({
        port: 0,
        host: "127.0.0.1",
        staticDir: "/nonexistent/static/path",
      });
    }).toThrow(
      'Static assets directory not found at "/nonexistent/static/path". Run "bun run build" in @devtools/frontend to generate static assets, or pass --static-dir <path>.',
    );
  });
});

describe("Daemon Configuration & Static Directory Resolution", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("resolveDaemonConfig returns defaults when options and env are empty", () => {
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.DEVTOOLS_STATIC_DIR;

    const config = resolveDaemonConfig({});
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4000);
    expect(config.staticDir).toBeUndefined();
  });

  test("resolveDaemonConfig respects explicit options over env", () => {
    process.env.PORT = "3000";
    process.env.HOST = "10.0.0.1";

    const config = resolveDaemonConfig({ port: 5000, host: "0.0.0.0" });
    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(5000);
  });

  test("resolveDaemonConfig respects environment overrides", () => {
    process.env.PORT = "4500";
    process.env.HOST = "192.168.1.50";

    const config = resolveDaemonConfig({});
    expect(config.host).toBe("192.168.1.50");
    expect(config.port).toBe(4500);
  });

  test("resolveDaemonConfig supports ephemeral port 0", () => {
    delete process.env.HOST;
    const config = resolveDaemonConfig({ port: 0 });
    expect(config.port).toBe(0);
    expect(config.host).toBe("127.0.0.1");
  });

  test("resolveDaemonConfig uniformly validates host even with port 0", () => {
    expect(() => resolveDaemonConfig({ port: 0, host: "" })).toThrow();
  });

  test("resolveStaticDir resolves explicit custom path and env overrides", () => {
    const custom = resolveStaticDir("/custom/test/dir");
    expect(custom).toContain("custom/test/dir");

    process.env.DEVTOOLS_STATIC_DIR = "/env/static/dir";
    const fromEnv = resolveStaticDir();
    expect(fromEnv).toContain("env/static/dir");
  });
});
