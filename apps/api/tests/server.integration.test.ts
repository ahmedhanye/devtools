import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HealthResponseSchema } from "@devtools/core";
import { createTeardown } from "@devtools/core/node";
import { openDb } from "@devtools/db";
import { createLighthouseStore } from "@devtools/lighthouse/wiring";
import {
  ActiveAuditJobResponseSchema,
  ListLighthouseRunsResponseSchema,
  TriggerLighthouseAuditResponseSchema,
} from "@devtools/lighthouse/schemas";
import { Hono } from "hono";
import { type ServerInstance, startServer } from "../src/app/server";

describe("Standalone Server Lifecycle", () => {
  let activeInstance: ServerInstance | null = null;

  afterEach(async () => {
    if (activeInstance) {
      await activeInstance.stop();
      activeInstance = null;
    }
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
      using ownerDb = openDb({ path: ownerDbPath });
      ownerDb.ensureReady();

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
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("keeps a shared file-backed DB healthy on server 2 after stopping server 1", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-srv-shared-db-"));
    const sharedDbPath = join(tmpDir, "shared.db");
    let server1: ServerInstance | null = null;
    let server2: ServerInstance | null = null;

    try {
      server1 = startServer({
        port: 0,
        hostname: "127.0.0.1",
        env: { DEVTOOLS_DB_PATH: sharedDbPath },
      });
      server2 = startServer({
        port: 0,
        hostname: "127.0.0.1",
        env: { DEVTOOLS_DB_PATH: sharedDbPath },
      });

      const res1 = await fetch(
        `http://127.0.0.1:${server1.port}/api/lighthouse/runs`,
      );
      expect(res1.status).toBe(200);
      expect(
        ListLighthouseRunsResponseSchema.parse(await res1.json()).total,
      ).toBe(0);

      const res2Before = await fetch(
        `http://127.0.0.1:${server2.port}/api/lighthouse/runs`,
      );
      expect(res2Before.status).toBe(200);
      expect(
        ListLighthouseRunsResponseSchema.parse(await res2Before.json()).total,
      ).toBe(0);

      await server1.stop();
      server1 = null;

      const res2After = await fetch(
        `http://127.0.0.1:${server2.port}/api/lighthouse/runs`,
      );
      expect(res2After.status).toBe(200);
      expect(
        ListLighthouseRunsResponseSchema.parse(await res2After.json()).total,
      ).toBe(0);

      await server2.stop();
      server2 = null;
    } finally {
      if (server1) {
        await server1.stop();
      }
      if (server2) {
        await server2.stop();
      }
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("serves Lighthouse routes + SSE over live HTTP socket with injected store", async () => {
    const artifactsDir = mkdtempSync(join(tmpdir(), "devtools-srv-lh-"));
    try {
      using customDb = openDb({ memory: true });
      const customStore = createLighthouseStore({
        db: customDb,
        artifactsDir,
      });

      let releaseAudit!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseAudit = resolve;
      });

      activeInstance = startServer({
        port: 0,
        hostname: "127.0.0.1",
        store: customStore,
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
      using customDb = openDb({ memory: true });
      const customStore = createLighthouseStore({
        db: customDb,
        artifactsDir,
      });

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
        store: customStore,
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
      expect(customStore.listRuns()).toHaveLength(0);
      expect(readdirSync(artifactsDir)).toHaveLength(0);
    } finally {
      rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  test("preserves background audit completion when a live TCP SSE client aborts mid-stream", async () => {
    const artifactsDir = mkdtempSync(join(tmpdir(), "devtools-srv-abort-"));
    try {
      using customDb = openDb({ memory: true });
      const customStore = createLighthouseStore({
        db: customDb,
        artifactsDir,
      });

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
        store: customStore,
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

  test("stops both HTTP listeners and aborts/awaits active audits when two startServer instances share one Teardown", async () => {
    const artifactsDir1 = mkdtempSync(join(tmpdir(), "devtools-srv-shared-1-"));
    const artifactsDir2 = mkdtempSync(join(tmpdir(), "devtools-srv-shared-2-"));
    let server1: ServerInstance | null = null;
    let server2: ServerInstance | null = null;
    let releaseCleanup1!: () => void;
    let releaseCleanup2!: () => void;

    const createRunner = (
      notifyStarted: () => void,
      cleanupGate: Promise<void>,
      onAbort: () => void,
      onFinished: () => void,
    ) => {
      return async (params: { url: string; signal?: AbortSignal }) => {
        params.signal?.addEventListener("abort", onAbort);
        notifyStarted();
        await cleanupGate;
        onFinished();
        return {
          validatedUrl: params.url,
          formFactor: "mobile" as const,
          throttlingMethod: "simulate" as const,
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
          reportHtml: "<!doctype html><html><body>Shared</body></html>",
          representativeRunIndex: 0,
          durationMs: 300,
        };
      };
    };

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

      let notifyStarted1!: () => void;
      const started1 = new Promise<void>((resolve) => {
        notifyStarted1 = resolve;
      });
      const cleanupGate1 = new Promise<void>((resolve) => {
        releaseCleanup1 = resolve;
      });
      let aborted1 = false;
      let finished1 = false;

      let notifyStarted2!: () => void;
      const started2 = new Promise<void>((resolve) => {
        notifyStarted2 = resolve;
      });
      const cleanupGate2 = new Promise<void>((resolve) => {
        releaseCleanup2 = resolve;
      });
      let aborted2 = false;
      let finished2 = false;

      server1 = startServer({
        port: 0,
        hostname: "127.0.0.1",
        signal: teardown.signal,
        store: store1,
        artifactsDir: artifactsDir1,
        auditRunner: createRunner(
          notifyStarted1,
          cleanupGate1,
          () => {
            aborted1 = true;
          },
          () => {
            finished1 = true;
          },
        ),
      });

      server2 = startServer({
        port: 0,
        hostname: "127.0.0.1",
        signal: teardown.signal,
        store: store2,
        artifactsDir: artifactsDir2,
        auditRunner: createRunner(
          notifyStarted2,
          cleanupGate2,
          () => {
            aborted2 = true;
          },
          () => {
            finished2 = true;
          },
        ),
      });

      teardown.defer(() => server1?.stop());
      teardown.defer(() => server2?.stop());

      const port1 = server1.port;
      const port2 = server2.port;

      const [postRes1, postRes2] = await Promise.all([
        fetch(`http://127.0.0.1:${port1}/api/lighthouse/audits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://example.com/shared-1" }),
        }),
        fetch(`http://127.0.0.1:${port2}/api/lighthouse/audits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://example.com/shared-2" }),
        }),
      ]);
      expect(postRes1.status).toBe(202);
      expect(postRes2.status).toBe(202);
      await Promise.all([started1, started2]);

      let shutdownResolved = false;
      const shutdownPromise = (async () => {
        await teardown.run("SIGTERM");
        shutdownResolved = true;
      })();

      await Bun.sleep(15);
      expect(aborted1).toBe(true);
      expect(aborted2).toBe(true);
      expect(shutdownResolved).toBe(false);

      releaseCleanup2();
      await Bun.sleep(15);
      expect(finished2).toBe(true);
      expect(finished1).toBe(false);
      expect(shutdownResolved).toBe(false);

      releaseCleanup1();
      await shutdownPromise;

      expect(shutdownResolved).toBe(true);
      expect(finished1).toBe(true);
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
      releaseCleanup1?.();
      releaseCleanup2?.();
      await server1?.server.stop(true);
      await server2?.server.stop(true);
      rmSync(artifactsDir1, { recursive: true, force: true });
      rmSync(artifactsDir2, { recursive: true, force: true });
    }
  });

  test("supports custom Hono app without shutdown() and forwards AbortSignal abort cleanly", async () => {
    const customApp = new Hono().get("/ping", (c) => c.text("pong"));
    activeInstance = startServer({
      port: 0,
      hostname: "127.0.0.1",
      app: customApp,
    });
    const res = await fetch(`http://127.0.0.1:${activeInstance.port}/ping`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("pong");
    await activeInstance.stop();
    activeInstance = null;
  });
});
