import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiErrorResponseSchema, HealthResponseSchema } from "@devtools/core";
import { db, resetDb, systemMetadata } from "@devtools/db";
import { TriggerLighthouseAuditResponseSchema } from "@devtools/lighthouse/schemas";
import {
  type DaemonInstance,
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
    activeDaemon = startDaemon({
      port: 0,
      host: "127.0.0.1",
      env: { DEVTOOLS_DB_PATH: ":memory:" },
    });
    const records = await db.select().from(systemMetadata);
    expect(Array.isArray(records)).toBe(true);
  });

  test("throws and attaches cause when database initialization fails regardless of user privileges", async () => {
    resetDb();
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-daemon-corrupt-"));
    const corruptDbPath = join(tmpDir, "corrupt.db");
    writeFileSync(corruptDbPath, "not-a-sqlite-database\n");
    let unexpectedDaemon: DaemonInstance | undefined;

    try {
      let caughtError: unknown;
      try {
        unexpectedDaemon = startDaemon({
          port: 0,
          host: "127.0.0.1",
          env: { DEVTOOLS_DB_PATH: corruptDbPath },
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toMatch(
        /^Fatal: failed to initialize persistence database: /,
      );
      expect((caughtError as Error).cause).toBeInstanceOf(Error);
    } finally {
      if (unexpectedDaemon) {
        await unexpectedDaemon.stop();
      }
      rmSync(tmpDir, { recursive: true, force: true });
      resetDb();
    }
  });

  test("closes opened database handle when port binding fails on an occupied port", async () => {
    resetDb();
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-daemon-port-"));
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("occupied"),
    });
    let unexpectedDaemon: DaemonInstance | undefined;

    try {
      let caughtError: unknown;
      try {
        unexpectedDaemon = startDaemon({
          port: blocker.port,
          host: "127.0.0.1",
          env: { DEVTOOLS_DB_PATH: join(tmpDir, "blocked.db") },
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
    } finally {
      if (unexpectedDaemon) {
        await unexpectedDaemon.stop();
      }
      await blocker.stop(true);
      rmSync(tmpDir, { recursive: true, force: true });
      resetDb();
    }
  });

  test("stop() cancels active Lighthouse audit via api.shutdown() before closing database", async () => {
    resetDb();
    const artifactsDir = mkdtempSync(
      join(tmpdir(), "devtools-daemon-lh-stop-"),
    );
    try {
      activeDaemon = startDaemon({
        port: 0,
        host: "127.0.0.1",
        env: {
          DEVTOOLS_DB_PATH: ":memory:",
          DEVTOOLS_CHROME_PATH: "/nonexistent/devtools-daemon-chrome",
          DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR: artifactsDir,
        },
      });

      const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;
      const triggerRes = await fetch(`${baseUrl}/api/lighthouse/audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/" }),
      });
      expect(triggerRes.status).toBe(202);
      TriggerLighthouseAuditResponseSchema.parse(await triggerRes.json());

      const daemonToStop = activeDaemon;
      activeDaemon = null;
      await daemonToStop.stop();

      expect(readdirSync(artifactsDir)).toHaveLength(0);
    } finally {
      try {
        if (activeDaemon) {
          const daemonToStop = activeDaemon;
          activeDaemon = null;
          await daemonToStop.stop();
        }
      } finally {
        rmSync(artifactsDir, { recursive: true, force: true });
        resetDb();
      }
    }
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

  test("blocks single-encoded path traversal attempts with 403 Forbidden", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const res = await serveStaticAsset(
      activeDaemon.staticDir,
      "/%2e%2e/package.json",
    );
    expect(res.status).toBe(403);
  });

  test("confines double-encoded path traversal attempts returning 404 Not Found", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const res = await serveStaticAsset(
      activeDaemon.staticDir,
      "/%252e%252e/package.json",
    );
    expect(res.status).toBe(404);

    const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;
    const httpRes = await fetch(`${baseUrl}/%252e%252e/package.json`);
    expect(httpRes.status).toBe(404);
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
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-test-daemon-"));
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

  test("returns 400 Bad Request on malformed percent-encoding in static asset request", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;

    const res = await fetch(`${baseUrl}/%E0%A4%A`);
    expect(res.status).toBe(400);
  });

  test("blocks root filesystem traversal attempts with 403 Forbidden", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    const res = await serveStaticAsset(
      activeDaemon.staticDir,
      "/../../etc/passwd",
    );
    expect(res.status).toBe(403);
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
