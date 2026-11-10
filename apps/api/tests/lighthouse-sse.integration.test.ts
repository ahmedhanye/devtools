import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { API_ERROR_CODES, ApiErrorResponseSchema } from "@devtools/core";
import { createDb, runMigrations, type DevtoolsDb } from "@devtools/db";
import {
  listLighthouseRuns,
  type LighthouseBatchExecutionResult,
} from "@devtools/lighthouse";
import {
  AuditSseCompleteEventSchema,
  AuditSseErrorEventSchema,
  AuditSseProgressEventSchema,
  TriggerLighthouseAuditResponseSchema,
} from "@devtools/lighthouse/schemas";
import { createApp } from "../src/index";
import { AuditWorkerError } from "../src/lighthouse/worker-runner";

interface ParsedSseFrame {
  event?: string;
  data?: string;
  comment?: string;
}

function parseSseFrames(raw: string): ParsedSseFrame[] {
  const frames: ParsedSseFrame[] = [];
  for (const chunk of raw.split("\n\n")) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(":")) {
      frames.push({ comment: trimmed.slice(1).trim() });
      continue;
    }
    let event: string | undefined;
    const dataLines: string[] = [];
    for (const line of chunk.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
    frames.push({ event, data: dataLines.join("\n") });
  }
  return frames;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeBatchResult(url: string): LighthouseBatchExecutionResult {
  return {
    validatedUrl: url,
    formFactor: "mobile",
    throttlingMethod: "simulate",
    totalRuns: 1,
    normalized: {
      requestedUrl: url,
      finalUrl: url,
      scores: {
        performanceScore: 91,
        accessibilityScore: 100,
        bestPracticesScore: 95,
        seoScore: 96,
      },
      metrics: {
        lcpMs: 1300,
        cls: 0.01,
        tbtMs: 25,
        fcpMs: 700,
        siMs: 1150,
        ttfbMs: 65,
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
    reportJson: JSON.stringify({ url }),
    reportHtml: "<!doctype html><html><body>SSE Report</body></html>",
    representativeRunIndex: 0,
    durationMs: 900,
  };
}

describe("Lighthouse Audit Job SSE Streaming (/api/lighthouse/audits/:jobId/stream)", () => {
  let db: DevtoolsDb;
  let artifactsDir: string;

  beforeEach(() => {
    db = createDb({ path: ":memory:" });
    runMigrations(db);
    artifactsDir = mkdtempSync(join(tmpdir(), "devtools-api-sse-"));
  });

  afterEach(() => {
    rmSync(artifactsDir, { recursive: true, force: true });
  });

  it("returns 404 for unknown or expired jobId", async () => {
    const app = createApp({ db, artifactsDir });
    const res = await app.request("/api/lighthouse/audits/unknown-job/stream");
    expect(res.status).toBe(404);
    expect(ApiErrorResponseSchema.parse(await res.json()).error.code).toBe(
      API_ERROR_CODES.NOT_FOUND,
    );
  });

  it("streams live progress, keepalive comments, completion event, disables server timeout, and persists artifacts", async () => {
    const deferred = createDeferred<LighthouseBatchExecutionResult>();
    const timeoutCalls: Array<number> = [];

    const app = createApp({
      db,
      artifactsDir,
      keepaliveIntervalMs: 20,
      auditRunner: async (params) => {
        params.onProgress?.({
          stage: "locating_browser",
          message: "Finding Chromium",
          runIndex: 0,
          totalRuns: 1,
        });
        // Also emit a terminal "complete" progress marker to verify SSE does not duplicate it
        params.onProgress?.({
          stage: "complete",
          message: "Batch finished",
          runIndex: 0,
          totalRuns: 1,
        });
        return deferred.promise;
      },
    });

    const triggerRes = await app.request("/api/lighthouse/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/" }),
    });
    const { job } = TriggerLighthouseAuditResponseSchema.parse(
      await triggerRes.json(),
    );

    // Connect via app.fetch with mocked Bun.serve binding to verify server.timeout(req, 0)
    const streamReq = new Request(
      `http://127.0.0.1:4000/api/lighthouse/audits/${job.id}/stream`,
    );
    const streamRes = await app.fetch(streamReq, {
      server: {
        requestIP: () => ({
          address: "127.0.0.1",
          family: "IPv4",
          port: 55000,
        }),
        timeout: (_req: Request, seconds: number) => {
          timeoutCalls.push(seconds);
        },
      },
    } as never);

    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get("content-type")).toContain(
      "text/event-stream",
    );
    expect(timeoutCalls).toEqual([0]);

    // Wait long enough for >= 1 keepalive comment, then resolve job
    await new Promise((r) => setTimeout(r, 55));
    deferred.resolve(makeBatchResult("https://example.com/"));

    const rawSse = await streamRes.text();
    const frames = parseSseFrames(rawSse);

    const progressFrames = frames.filter((f) => f.event === "progress");
    expect(progressFrames).toHaveLength(1);
    const progressPayload = AuditSseProgressEventSchema.parse(
      JSON.parse(progressFrames[0]!.data!),
    );
    expect(progressPayload.stage).toBe("locating_browser");

    const keepalives = frames.filter((f) => f.comment === "keepalive");
    expect(keepalives.length).toBeGreaterThanOrEqual(1);

    const completeFrames = frames.filter((f) => f.event === "complete");
    expect(completeFrames).toHaveLength(1);
    const completePayload = AuditSseCompleteEventSchema.parse(
      JSON.parse(completeFrames[0]!.data!),
    );
    expect(completePayload.jobId).toBe(job.id);
    expect(completePayload.run.performanceScore).toBe(91);

    const persistedRows = listLighthouseRuns(db);
    expect(persistedRows).toHaveLength(1);
    expect(existsSync(persistedRows[0]!.htmlReportPath)).toBe(true);
  });

  it("keeps running audit alive on client SSE abort and replays terminal snapshot within retention window", async () => {
    const deferred = createDeferred<LighthouseBatchExecutionResult>();
    const app = createApp({
      db,
      artifactsDir,
      jobRetentionMs: 60,
      keepaliveIntervalMs: 1000,
      auditRunner: async (params) => {
        params.onProgress?.({
          stage: "navigating",
          message: "Navigating to page",
          runIndex: 0,
          totalRuns: 1,
        });
        return deferred.promise;
      },
    });

    const triggerRes = await app.request("/api/lighthouse/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/reconnect" }),
    });
    const { job } = TriggerLighthouseAuditResponseSchema.parse(
      await triggerRes.json(),
    );

    // Connect and cancel stream reader mid-audit (simulating browser tab refresh/disconnect)
    const firstStreamRes = await app.request(
      `/api/lighthouse/audits/${job.id}/stream`,
    );
    const reader = firstStreamRes.body!.getReader();
    const firstChunk = await reader.read();
    expect(new TextDecoder().decode(firstChunk.value)).toContain("navigating");
    await reader.cancel();

    // Second subscriber connecting mid-flight immediately replays latestProgress before completion
    const secondStreamPromise = app.request(
      `/api/lighthouse/audits/${job.id}/stream`,
    );
    const secondStreamRes = await secondStreamPromise;
    const secondReader = secondStreamRes.body!.getReader();
    const replayProgressChunk = await secondReader.read();
    expect(new TextDecoder().decode(replayProgressChunk.value)).toContain(
      "navigating",
    );

    // Job finishes in background despite first client disconnect
    deferred.resolve(makeBatchResult("https://example.com/reconnect"));
    const secondTail = await new Response(
      new ReadableStream({
        async start(controller) {
          while (true) {
            const { done, value } = await secondReader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        },
      }),
    ).text();
    expect(secondTail).toContain("complete");
    expect(listLighthouseRuns(db)).toHaveLength(1);

    // Late/reconnected subscriber immediately receives terminal complete event
    const replayRes = await app.request(
      `/api/lighthouse/audits/${job.id}/stream`,
    );
    expect(replayRes.status).toBe(200);
    const replayFrames = parseSseFrames(await replayRes.text());
    expect(replayFrames).toHaveLength(1);
    expect(replayFrames[0]?.event).toBe("complete");
    AuditSseCompleteEventSchema.parse(JSON.parse(replayFrames[0]!.data!));

    // After retention expires, stream returns 404
    await new Promise((r) => setTimeout(r, 80));
    const expiredRes = await app.request(
      `/api/lighthouse/audits/${job.id}/stream`,
    );
    expect(expiredRes.status).toBe(404);
  });

  it("emits a single structured error SSE event without Hono duplicate error frames on failure", async () => {
    const app = createApp({
      db,
      artifactsDir,
      jobRetentionMs: 5000,
      auditRunner: async () => {
        throw new AuditWorkerError(
          "BROWSER_NOT_FOUND",
          "Chromium executable not found",
        );
      },
    });

    const triggerRes = await app.request("/api/lighthouse/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/fail" }),
    });
    const { job } = TriggerLighthouseAuditResponseSchema.parse(
      await triggerRes.json(),
    );

    const streamRes = await app.request(
      `/api/lighthouse/audits/${job.id}/stream`,
    );
    expect(streamRes.status).toBe(200);
    const frames = parseSseFrames(await streamRes.text());

    const errorFrames = frames.filter((f) => f.event === "error");
    expect(errorFrames).toHaveLength(1);
    const errPayload = AuditSseErrorEventSchema.parse(
      JSON.parse(errorFrames[0]!.data!),
    );
    expect(errPayload.error.code).toBe("BROWSER_NOT_FOUND");
    expect(errPayload.error.message).toBe("Chromium executable not found");

    // Starting a new Audit Job immediately clears the retained terminal job snapshot
    const secondTrigger = await app.request("/api/lighthouse/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/second" }),
    });
    expect(secondTrigger.status).toBe(202);
    const oldStreamRes = await app.request(
      `/api/lighthouse/audits/${job.id}/stream`,
    );
    expect(oldStreamRes.status).toBe(404);
  });

  it("emits SSE error and clears active job when parent-thread persistence fails", async () => {
    const fileInsteadOfDir = join(artifactsDir, "not-a-directory");
    writeFileSync(fileInsteadOfDir, "occupied");

    const app = createApp({
      db,
      artifactsDir: fileInsteadOfDir,
      auditRunner: async () =>
        makeBatchResult("https://example.com/persist-fail"),
    });

    const triggerRes = await app.request("/api/lighthouse/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/persist-fail" }),
    });
    expect(triggerRes.status).toBe(202);
    const { job } = TriggerLighthouseAuditResponseSchema.parse(
      await triggerRes.json(),
    );

    const streamRes = await app.request(
      `/api/lighthouse/audits/${job.id}/stream`,
    );
    expect(streamRes.status).toBe(200);
    const frames = parseSseFrames(await streamRes.text());
    const errorFrames = frames.filter((f) => f.event === "error");
    expect(errorFrames).toHaveLength(1);
    const errPayload = AuditSseErrorEventSchema.parse(
      JSON.parse(errorFrames[0]!.data!),
    );
    expect(errPayload.error.code).toBe(API_ERROR_CODES.INTERNAL_ERROR);

    const activeRes = await app.request("/api/lighthouse/audits/active");
    expect((await activeRes.json()).active).toBe(false);
  });
});
