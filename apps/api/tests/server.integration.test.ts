import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HealthResponseSchema } from "@devtools/core";
import { createDb, resetDb, runMigrations } from "@devtools/db";
import {
  ActiveAuditJobResponseSchema,
  ListLighthouseRunsResponseSchema,
  TriggerLighthouseAuditResponseSchema,
} from "@devtools/lighthouse/schemas";
import { type ServerInstance, startServer } from "../src/server";

describe("Standalone Server Lifecycle", () => {
  let activeInstance: ServerInstance | null = null;

  afterEach(async () => {
    if (activeInstance) {
      await activeInstance.stop();
      activeInstance = null;
    }
    resetDb();
  });

  test("boots on ephemeral port 0 and serves /api/health over HTTP socket", async () => {
    activeInstance = startServer({ port: 0, hostname: "127.0.0.1" });
    expect(activeInstance.port).toBeGreaterThan(0);

    const response = await fetch(
      `http://127.0.0.1:${activeInstance.port}/api/health`,
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    const parsed = HealthResponseSchema.parse(data);
    expect(parsed.status).toBe("ok");
  });

  test("gracefully stops and closes socket connections", async () => {
    activeInstance = startServer({ port: 0, hostname: "127.0.0.1" });
    const port = activeInstance.port;

    // Verify it responds
    const initialRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(initialRes.status).toBe(200);

    // Stop server
    await activeInstance.stop();
    activeInstance = null;

    // Subsequent fetch should fail to connect
    expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
  });

  test("detects port conflict when port is already in use", async () => {
    activeInstance = startServer({ port: 0, hostname: "127.0.0.1" });
    const occupiedPort = activeInstance.port;

    expect(() => {
      startServer({ port: occupiedPort, hostname: "127.0.0.1" });
    }).toThrow();
  });

  test("initializes SQLite migrations on startup and serves Lighthouse routes + SSE over live HTTP socket", async () => {
    const artifactsDir = mkdtempSync(join(tmpdir(), "devtools-srv-lh-"));
    try {
      let releaseAudit!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseAudit = resolve;
      });

      activeInstance = startServer({
        port: 0,
        hostname: "127.0.0.1",
        artifactsDir,
        auditRunner: async (params) => {
          params.onProgress?.({
            stage: "navigating",
            message: "Navigating",
            runIndex: 0,
            totalRuns: 1,
          });
          await gate;
          return {
            validatedUrl: params.url,
            formFactor: "mobile",
            throttlingMethod: "simulate",
            totalRuns: 1,
            normalized: {
              requestedUrl: params.url,
              finalUrl: params.url,
              scores: {
                performanceScore: 97,
                accessibilityScore: 100,
                bestPracticesScore: 95,
                seoScore: 99,
              },
              metrics: {
                lcpMs: 1050,
                cls: 0.01,
                tbtMs: 15,
                fcpMs: 650,
                siMs: 950,
                ttfbMs: 45,
              },
              summary: {
                lcpElement: null,
                lcpPhases: null,
                clsCulprits: [],
                insights: [],
                failedAudits: [],
                runWarnings: [],
                runtimeError: null,
                medianMetadata: null,
              },
            },
            reportJson: "{}",
            reportHtml: "<!doctype html><html><body>Live</body></html>",
            representativeRunIndex: 0,
            durationMs: 450,
          };
        },
      });

      const baseUrl = `http://127.0.0.1:${activeInstance.port}`;

      // DB migrations ran automatically so /api/lighthouse/runs works out of the box
      const emptyRunsRes = await fetch(`${baseUrl}/api/lighthouse/runs`);
      expect(emptyRunsRes.status).toBe(200);
      expect(
        ListLighthouseRunsResponseSchema.parse(await emptyRunsRes.json()).total,
      ).toBe(0);

      // Trigger audit over real socket and open SSE stream
      const postRes = await fetch(`${baseUrl}/api/lighthouse/audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/" }),
      });
      expect(postRes.status).toBe(202);
      const { job } = TriggerLighthouseAuditResponseSchema.parse(
        await postRes.json(),
      );

      // Verify /api/health remains responsive concurrently while audit is active
      const [healthRes, activeRes] = await Promise.all([
        fetch(`${baseUrl}/api/health`),
        fetch(`${baseUrl}/api/lighthouse/audits/active`),
      ]);
      expect(healthRes.status).toBe(200);
      expect(
        ActiveAuditJobResponseSchema.parse(await activeRes.json()).active,
      ).toBe(true);

      const sseRes = await fetch(
        `${baseUrl}/api/lighthouse/audits/${job.id}/stream`,
      );
      expect(sseRes.status).toBe(200);
      releaseAudit();
      const sseText = await sseRes.text();
      expect(sseText).toContain("event: complete");

      const runsAfter = ListLighthouseRunsResponseSchema.parse(
        await (await fetch(`${baseUrl}/api/lighthouse/runs`)).json(),
      );
      expect(runsAfter.total).toBe(1);
    } finally {
      rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  test("fails fast on read-only SQLite file, avoids singleton leak on bind error, and supports injected db seam", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-srv-ro-"));
    const readOnlyDbPath = join(tmpDir, "readonly.db");
    writeFileSync(readOnlyDbPath, "");
    chmodSync(readOnlyDbPath, 0o444);

    try {
      expect(() =>
        startServer({
          port: 0,
          hostname: "127.0.0.1",
          env: { DEVTOOLS_DB_PATH: readOnlyDbPath },
        }),
      ).toThrow(/Fatal: failed to initialize persistence database/);
    } finally {
      chmodSync(readOnlyDbPath, 0o644);
      rmSync(tmpDir, { recursive: true, force: true });
      resetDb();
    }

    const leakDir = mkdtempSync(join(tmpdir(), "devtools-srv-leak-"));
    try {
      activeInstance = startServer({
        port: 0,
        hostname: "127.0.0.1",
        env: { DEVTOOLS_DB_PATH: join(leakDir, "owner.db") },
      });
      const occupiedPort = activeInstance.port;
      const leakDbPath = join(leakDir, "leak.db");
      expect(() =>
        startServer({
          port: occupiedPort,
          hostname: "127.0.0.1",
          env: { DEVTOOLS_DB_PATH: leakDbPath },
        }),
      ).toThrow();
      await activeInstance.stop();
      activeInstance = null;
    } finally {
      rmSync(leakDir, { recursive: true, force: true });
      resetDb();
    }

    const customDb = createDb({ path: ":memory:" });
    runMigrations(customDb);
    activeInstance = startServer({
      port: 0,
      hostname: "127.0.0.1",
      db: customDb,
    });
    const res = await fetch(
      `http://127.0.0.1:${activeInstance.port}/api/lighthouse/runs`,
    );
    expect(res.status).toBe(200);
  });

  test("routes non-/api requests to fallbackFetch while routing /api and /api/* to Hono", async () => {
    activeInstance = startServer({
      port: 0,
      hostname: "127.0.0.1",
      fallbackFetch: (req) =>
        new Response(`fallback:${new URL(req.url).pathname}`, { status: 200 }),
    });

    const baseUrl = `http://127.0.0.1:${activeInstance.port}`;
    const staticRes = await fetch(`${baseUrl}/dashboard`);
    expect(staticRes.status).toBe(200);
    expect(await staticRes.text()).toBe("fallback:/dashboard");

    const apiRootRes = await fetch(`${baseUrl}/api`);
    expect(apiRootRes.status).toBe(404);
    expect(apiRootRes.headers.get("content-type")).toContain(
      "application/json",
    );

    const apiRes = await fetch(`${baseUrl}/api/health`);
    expect(apiRes.status).toBe(200);
  });

  test("preserves background audit completion when a live TCP SSE client aborts mid-stream", async () => {
    const artifactsDir = mkdtempSync(join(tmpdir(), "devtools-srv-abort-"));
    try {
      let releaseAudit!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseAudit = resolve;
      });
      let notifyStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        notifyStarted = resolve;
      });

      activeInstance = startServer({
        port: 0,
        hostname: "127.0.0.1",
        artifactsDir,
        auditRunner: async (params) => {
          params.onProgress?.({
            stage: "navigating",
            message: "Navigating",
            runIndex: 0,
            totalRuns: 1,
          });
          notifyStarted();
          await gate;
          return {
            validatedUrl: params.url,
            formFactor: "mobile",
            throttlingMethod: "simulate",
            totalRuns: 1,
            normalized: {
              requestedUrl: params.url,
              finalUrl: params.url,
              scores: {
                performanceScore: 90,
                accessibilityScore: 100,
                bestPracticesScore: 95,
                seoScore: 98,
              },
              metrics: {
                lcpMs: 1200,
                cls: 0.01,
                tbtMs: 25,
                fcpMs: 700,
                siMs: 1100,
                ttfbMs: 50,
              },
              summary: {
                lcpElement: null,
                lcpPhases: null,
                clsCulprits: [],
                insights: [],
                failedAudits: [],
                runWarnings: [],
                runtimeError: null,
                medianMetadata: null,
              },
            },
            reportJson: "{}",
            reportHtml: "<!doctype html><html><body>TCP Abort</body></html>",
            representativeRunIndex: 0,
            durationMs: 350,
          };
        },
      });

      const baseUrl = `http://127.0.0.1:${activeInstance.port}`;
      const postRes = await fetch(`${baseUrl}/api/lighthouse/audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/tcp-abort" }),
      });
      const { job } = TriggerLighthouseAuditResponseSchema.parse(
        await postRes.json(),
      );
      await started;

      const abortController = new AbortController();
      const sseRes = await fetch(
        `${baseUrl}/api/lighthouse/audits/${job.id}/stream`,
        { signal: abortController.signal },
      );
      const reader = sseRes.body!.getReader();
      const firstChunk = await reader.read();
      expect(new TextDecoder().decode(firstChunk.value)).toContain(
        "navigating",
      );
      abortController.abort();

      releaseAudit();
      await new Promise((r) => setTimeout(r, 25));

      const runsAfter = ListLighthouseRunsResponseSchema.parse(
        await (await fetch(`${baseUrl}/api/lighthouse/runs`)).json(),
      );
      expect(runsAfter.total).toBe(1);
    } finally {
      rmSync(artifactsDir, { recursive: true, force: true });
    }
  });
});
