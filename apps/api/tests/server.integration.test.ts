import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HealthResponseSchema } from "@devtools/core";
import { closeDb, createDb, getDb, resetDb, runMigrations } from "@devtools/db";
import { listLighthouseRuns } from "@devtools/lighthouse";
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

    const initialRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(initialRes.status).toBe(200);

    await activeInstance.stop();
    activeInstance = null;

    expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
  });

  test("detects port conflict without disrupting an already-running server DB handle", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-srv-conflict-"));
    try {
      const ownerDbPath = join(tmpDir, "owner.db");
      const ownerDb = getDb({ path: ownerDbPath });
      runMigrations(ownerDb);

      activeInstance = startServer({
        port: 0,
        hostname: "127.0.0.1",
        env: { DEVTOOLS_DB_PATH: ownerDbPath },
      });
      const occupiedPort = activeInstance.port;

      expect(() => {
        startServer({
          port: occupiedPort,
          hostname: "127.0.0.1",
          env: { DEVTOOLS_DB_PATH: join(tmpDir, "conflict.db") },
        });
      }).toThrow();

      const runsRes = await fetch(
        `http://127.0.0.1:${occupiedPort}/api/lighthouse/runs`,
      );
      expect(runsRes.status).toBe(200);
      expect(
        ListLighthouseRunsResponseSchema.parse(await runsRes.json()).total,
      ).toBe(0);
    } finally {
      if (activeInstance) {
        await activeInstance.stop();
        activeInstance = null;
      }
      resetDb();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("serves Lighthouse routes + SSE over live HTTP socket with injected db", async () => {
    const artifactsDir = mkdtempSync(join(tmpdir(), "devtools-srv-lh-"));
    try {
      const customDb = createDb({ path: ":memory:" });
      runMigrations(customDb);

      let releaseAudit!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseAudit = resolve;
      });

      activeInstance = startServer({
        port: 0,
        hostname: "127.0.0.1",
        db: customDb,
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

      const emptyRunsRes = await fetch(`${baseUrl}/api/lighthouse/runs`);
      expect(emptyRunsRes.status).toBe(200);
      expect(
        ListLighthouseRunsResponseSchema.parse(await emptyRunsRes.json()).total,
      ).toBe(0);

      const postRes = await fetch(`${baseUrl}/api/lighthouse/audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/" }),
      });
      expect(postRes.status).toBe(202);
      const { job } = TriggerLighthouseAuditResponseSchema.parse(
        await postRes.json(),
      );

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

  test("mid-audit stop() aborts active runner, awaits settlement, and leaves zero orphan artifacts or closed-DB errors", async () => {
    const artifactsDir = mkdtempSync(join(tmpdir(), "devtools-srv-stop-"));
    try {
      const customDb = getDb({ path: ":memory:" });
      runMigrations(customDb);

      let notifyStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        notifyStarted = resolve;
      });
      let releaseCleanup!: () => void;
      const cleanupGate = new Promise<void>((resolve) => {
        releaseCleanup = resolve;
      });
      let signalAborted = false;
      let runnerFinished = false;

      activeInstance = startServer({
        port: 0,
        hostname: "127.0.0.1",
        db: customDb,
        artifactsDir,
        auditRunner: async (params) => {
          params.signal?.addEventListener("abort", () => {
            signalAborted = true;
          });
          notifyStarted();
          await cleanupGate;
          runnerFinished = true;
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
            reportHtml: "<!doctype html><html><body>Stop</body></html>",
            representativeRunIndex: 0,
            durationMs: 300,
          };
        },
      });

      const baseUrl = `http://127.0.0.1:${activeInstance.port}`;
      const postRes = await fetch(`${baseUrl}/api/lighthouse/audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/mid-stop" }),
      });
      expect(postRes.status).toBe(202);
      await started;

      let stopResolved = false;
      const instanceToStop = activeInstance;
      activeInstance = null;
      const stopPromise = (async () => {
        await instanceToStop.stop();
        stopResolved = true;
      })();

      await new Promise((r) => setTimeout(r, 15));
      expect(signalAborted).toBe(true);
      expect(stopResolved).toBe(false);
      expect(runnerFinished).toBe(false);

      releaseCleanup();
      await stopPromise;

      expect(stopResolved).toBe(true);
      expect(runnerFinished).toBe(true);
      expect(listLighthouseRuns(customDb)).toHaveLength(0);
      expect(readdirSync(artifactsDir)).toHaveLength(0);

      closeDb();
    } finally {
      rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  test("preserves background audit completion when a live TCP SSE client aborts mid-stream", async () => {
    const artifactsDir = mkdtempSync(join(tmpdir(), "devtools-srv-abort-"));
    try {
      const customDb = createDb({ path: ":memory:" });
      runMigrations(customDb);

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
        db: customDb,
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
