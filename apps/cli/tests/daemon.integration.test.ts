import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiErrorResponseSchema, HealthResponseSchema } from "@devtools/core";
import { createTeardown } from "@devtools/core/node";
import { openDb } from "@devtools/db";
import { AuditCancelledError } from "@devtools/lighthouse/contracts";
import { createLighthouseStore } from "@devtools/lighthouse/wiring";
import {
  ListLighthouseRunsResponseSchema,
  TriggerLighthouseAuditResponseSchema,
} from "@devtools/lighthouse/schemas";
import {
  type DaemonInstance,
  type StartDaemonOptions,
  serveStaticAsset,
  startDaemon,
} from "../src/commands/web/daemon";

interface GatedAuditControl {
  started: Promise<void>;
  release: () => void;
  isAborted: () => boolean;
  isFinished: () => boolean;
  runner: NonNullable<StartDaemonOptions["auditRunner"]>;
}

function createGatedAuditControl(): GatedAuditControl {
  let notifyStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  let release!: () => void;
  const cleanupGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let aborted = false;
  let finished = false;

  const runner: NonNullable<StartDaemonOptions["auditRunner"]> = async ({
    url,
    signal,
  }) => {
    signal?.addEventListener("abort", () => {
      aborted = true;
    });
    notifyStarted();
    await cleanupGate;
    finished = true;
    if (signal?.aborted) {
      throw new AuditCancelledError("Audit cancelled during daemon shutdown");
    }
    throw new Error(`Expected abort signal for ${url} before gate release`);
  };

  return {
    started,
    release,
    isAborted: () => aborted,
    isFinished: () => finished,
    runner,
  };
}

describe("Unified Loopback Daemon Lifecycle and Routing", () => {
  let activeDaemon: DaemonInstance | null = null;

  afterEach(async () => {
    if (activeDaemon) {
      await activeDaemon.stop();
      activeDaemon = null;
    }
  });

  test("defers SQLite initialization until the first database-backed API request", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-daemon-lazy-"));
    const lazyDbPath = join(tmpDir, "lazy.db");
    try {
      activeDaemon = startDaemon({
        port: 0,
        host: "127.0.0.1",
        env: { DEVTOOLS_DB_PATH: lazyDbPath },
      });
      const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;

      const healthRes = await fetch(`${baseUrl}/api/health`);
      expect(healthRes.status).toBe(200);
      expect(existsSync(lazyDbPath)).toBe(false);

      const runsRes = await fetch(`${baseUrl}/api/lighthouse/runs`);
      expect(runsRes.status).toBe(200);
      expect(
        ListLighthouseRunsResponseSchema.parse(await runsRes.json()).total,
      ).toBe(0);
      expect(existsSync(lazyDbPath)).toBe(true);
    } finally {
      if (activeDaemon) {
        await activeDaemon.stop();
        activeDaemon = null;
      }
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("keeps daemon healthy and reports API 500 when lazy database file is corrupt", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-daemon-corrupt-"));
    const corruptDbPath = join(tmpDir, "corrupt.db");
    writeFileSync(corruptDbPath, "not-a-sqlite-database\n");

    try {
      activeDaemon = startDaemon({
        port: 0,
        host: "127.0.0.1",
        env: { DEVTOOLS_DB_PATH: corruptDbPath },
      });
      const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;

      const healthRes = await fetch(`${baseUrl}/api/health`);
      expect(healthRes.status).toBe(200);

      const runsRes = await fetch(`${baseUrl}/api/lighthouse/runs`);
      expect(runsRes.status).toBe(500);
      expect(
        ApiErrorResponseSchema.parse(await runsRes.json()).error.code,
      ).toBe("INTERNAL_ERROR");
    } finally {
      if (activeDaemon) {
        await activeDaemon.stop();
        activeDaemon = null;
      }
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("does not open or create SQLite files when port binding fails on an occupied port", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-daemon-port-"));
    const blockedDbPath = join(tmpDir, "blocked.db");
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
          env: { DEVTOOLS_DB_PATH: blockedDbPath },
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect(existsSync(blockedDbPath)).toBe(false);
    } finally {
      if (unexpectedDaemon) {
        await unexpectedDaemon.stop();
      }
      await blocker.stop(true);
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("stop() cancels active Lighthouse audit via api.shutdown() before closing database", async () => {
    const artifactsDir = mkdtempSync(
      join(tmpdir(), "devtools-daemon-lh-stop-"),
    );
    const audit = createGatedAuditControl();

    try {
      activeDaemon = startDaemon({
        port: 0,
        host: "127.0.0.1",
        env: {
          DEVTOOLS_DB_PATH: ":memory:",
          DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR: artifactsDir,
        },
        auditRunner: audit.runner,
      });

      const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;
      const triggerRes = await fetch(`${baseUrl}/api/lighthouse/audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/" }),
      });
      expect(triggerRes.status).toBe(202);
      TriggerLighthouseAuditResponseSchema.parse(await triggerRes.json());
      await audit.started;

      const daemonToStop = activeDaemon;
      activeDaemon = null;
      let stopResolved = false;
      const stopPromise = (async () => {
        await daemonToStop.stop();
        stopResolved = true;
      })();

      await Bun.sleep(15);
      expect(audit.isAborted()).toBe(true);
      expect(audit.isFinished()).toBe(false);
      expect(stopResolved).toBe(false);

      audit.release();
      await stopPromise;

      expect(stopResolved).toBe(true);
      expect(audit.isFinished()).toBe(true);
      expect(readdirSync(artifactsDir)).toHaveLength(0);
    } finally {
      audit.release();
      try {
        if (activeDaemon) {
          const daemonToStop = activeDaemon;
          activeDaemon = null;
          await daemonToStop.stop();
        }
      } finally {
        rmSync(artifactsDir, { recursive: true, force: true });
      }
    }
  });

  test("teardown.run() stops both HTTP listeners and cancels active audits when two startDaemon instances share one Teardown", async () => {
    const artifactsDir1 = mkdtempSync(
      join(tmpdir(), "devtools-daemon-shared-1-"),
    );
    const artifactsDir2 = mkdtempSync(
      join(tmpdir(), "devtools-daemon-shared-2-"),
    );
    const audit1 = createGatedAuditControl();
    const audit2 = createGatedAuditControl();
    let daemon1: DaemonInstance | null = null;
    let daemon2: DaemonInstance | null = null;

    try {
      using db1 = openDb({ memory: true });
      using db2 = openDb({ memory: true });
      const store1 = createLighthouseStore({
        db: db1,
        artifactsDir: artifactsDir1,
      });
      const store2 = createLighthouseStore({
        db: db2,
        artifactsDir: artifactsDir2,
      });
      const teardown = createTeardown();

      daemon1 = startDaemon({
        port: 0,
        host: "127.0.0.1",
        store: store1,
        signal: teardown.signal,
        env: {
          DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR: artifactsDir1,
        },
        auditRunner: audit1.runner,
      });
      teardown.defer(() => daemon1?.stop());
      daemon2 = startDaemon({
        port: 0,
        host: "127.0.0.1",
        store: store2,
        signal: teardown.signal,
        env: {
          DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR: artifactsDir2,
        },
        auditRunner: audit2.runner,
      });
      teardown.defer(() => daemon2?.stop());

      const port1 = daemon1.port;
      const port2 = daemon2.port;

      const [health1, health2] = await Promise.all([
        fetch(`http://127.0.0.1:${port1}/api/health`),
        fetch(`http://127.0.0.1:${port2}/api/health`),
      ]);
      expect(health1.status).toBe(200);
      expect(health2.status).toBe(200);

      const [triggerRes1, triggerRes2] = await Promise.all([
        fetch(`http://127.0.0.1:${port1}/api/lighthouse/audits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://example.com/daemon-1" }),
        }),
        fetch(`http://127.0.0.1:${port2}/api/lighthouse/audits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://example.com/daemon-2" }),
        }),
      ]);
      expect(triggerRes1.status).toBe(202);
      expect(triggerRes2.status).toBe(202);
      TriggerLighthouseAuditResponseSchema.parse(await triggerRes1.json());
      TriggerLighthouseAuditResponseSchema.parse(await triggerRes2.json());
      await Promise.all([audit1.started, audit2.started]);

      let shutdownResolved = false;
      const shutdownPromise = (async () => {
        await teardown.run("SIGTERM");
        shutdownResolved = true;
      })();

      await Bun.sleep(15);
      expect(audit1.isAborted()).toBe(true);
      expect(audit2.isAborted()).toBe(true);
      expect(shutdownResolved).toBe(false);

      audit2.release();
      await Bun.sleep(15);
      expect(audit2.isFinished()).toBe(true);
      expect(audit1.isFinished()).toBe(false);
      expect(shutdownResolved).toBe(false);

      audit1.release();
      await shutdownPromise;

      expect(shutdownResolved).toBe(true);
      expect(audit1.isFinished()).toBe(true);
      expect(store1.listRuns()).toHaveLength(0);
      expect(store2.listRuns()).toHaveLength(0);
      expect(readdirSync(artifactsDir1)).toHaveLength(0);
      expect(readdirSync(artifactsDir2)).toHaveLength(0);

      await expect(
        fetch(`http://127.0.0.1:${port1}/api/health`),
      ).rejects.toThrow();
      await expect(
        fetch(`http://127.0.0.1:${port2}/api/health`),
      ).rejects.toThrow();
    } finally {
      audit1.release();
      audit2.release();
      await daemon1?.server.stop(true);
      await daemon2?.server.stop(true);
      rmSync(artifactsDir1, { recursive: true, force: true });
      rmSync(artifactsDir2, { recursive: true, force: true });
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

      const missingRes = await fetch(
        `http://127.0.0.1:${activeDaemon.port}/missing-route`,
      );
      expect(missingRes.status).toBe(404);
      expect(await missingRes.text()).toContain("Not Found");
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
