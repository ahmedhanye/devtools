import { API_ERROR_CODES } from "@devtools/core";
import { openDb, type DbHandle } from "@devtools/db";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuditCancelledError,
  EMPTY_LIGHTHOUSE_RUN_SUMMARY,
  createAuditJobManager,
  createLighthouseStore,
  type AuditJobStreamEvent,
  type LighthouseAuditRunner,
  type LighthouseBatchExecutionResult,
  type LighthouseStore,
  type NormalizedLighthouseAuditRequest,
} from "../src";

const DEFAULT_REQUEST: NormalizedLighthouseAuditRequest = {
  url: "https://example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  runs: 1,
  categories: ["performance", "accessibility", "best-practices", "seo"],
};

function makeBatchResult(
  url = "https://example.com/",
): LighthouseBatchExecutionResult {
  return {
    validatedUrl: url,
    formFactor: "mobile",
    throttlingMethod: "simulate",
    representativeRunIndex: 1,
    totalRuns: 1,
    durationMs: 2500,
    reportJson: JSON.stringify({ finalDisplayedUrl: url }),
    reportHtml: "<!doctype html><html><body>OK</body></html>",
    normalized: {
      requestedUrl: url,
      finalUrl: url,
      scores: {
        performanceScore: 91,
        accessibilityScore: 98,
        bestPracticesScore: 100,
        seoScore: 90,
      },
      metrics: {
        lcpMs: 1400,
        cls: 0.02,
        tbtMs: 80,
        fcpMs: 900,
        siMs: 1300,
        ttfbMs: 110,
      },
      summary: { ...EMPTY_LIGHTHOUSE_RUN_SUMMARY },
    },
  };
}

describe("AuditJobManager (packages/lighthouse)", () => {
  let tmpDir: string;
  let db: DbHandle;
  let artifactsDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "devtools-lh-job-"));
    artifactsDir = join(tmpDir, "artifacts");
    db = openDb({ memory: true });
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function createDeferred() {
    let resolveFn: ((value: LighthouseBatchExecutionResult) => void) | null =
      null;
    let rejectFn: ((reason?: unknown) => void) | null = null;
    const promise = new Promise<LighthouseBatchExecutionResult>((res, rej) => {
      resolveFn = res;
      rejectFn = rej;
    });
    return {
      promise,
      resolve: (val: LighthouseBatchExecutionResult) => resolveFn?.(val),
      reject: (err: unknown) => rejectFn?.(err),
    };
  }

  it("runs a job to completion, replays active/terminal SSE frames, and enforces single-job concurrency", async () => {
    const deferred = createDeferred();
    const liveProgressCallbacks: Array<() => void> = [];
    let capturedSignal: AbortSignal | undefined;
    const auditRunner: LighthouseAuditRunner = async (options) => {
      capturedSignal = options.signal;
      options.onProgress?.({
        stage: "navigating",
        message: "Navigating",
        runIndex: 1,
        totalRuns: 1,
      });
      options.onProgress?.({
        stage: "complete",
        message: "Ignored runner complete frame",
      });
      liveProgressCallbacks.push(() => {
        options.onProgress?.({
          stage: "analyzing",
          message: "Analyzing trace",
        });
      });
      return deferred.promise;
    };

    const store: LighthouseStore = createLighthouseStore({
      db,
      artifactsDir,
    });
    const manager = createAuditJobManager({ store, auditRunner });

    const startResult = manager.startJob(DEFAULT_REQUEST);
    expect(startResult.started).toBe(true);
    if (!startResult.started) {
      throw new Error("expected job to start");
    }
    expect(manager.getActiveJob()?.id).toBe(startResult.job.id);
    expect(manager.hasJob(startResult.job.id)).toBe(true);

    // Second concurrent job is rejected with activeJobId
    const second = manager.startJob({
      ...DEFAULT_REQUEST,
      url: "https://example.com/other",
    });
    expect(second).toEqual({
      started: false,
      activeJobId: startResult.job.id,
    });

    // Late subscriber receives latestProgress replay immediately
    const events: AuditJobStreamEvent[] = [];
    const sub = manager.subscribe(startResult.job.id, (ev) => {
      events.push(ev);
    });
    expect(sub?.initialTerminal).toBe(false);
    expect(events.map((e) => e.type)).toEqual(["progress"]);

    liveProgressCallbacks[0]?.();
    expect(events.map((e) => e.type)).toEqual(["progress", "progress"]);

    deferred.resolve(makeBatchResult());
    await new Promise((r) => setTimeout(r, 15));

    expect(manager.getActiveJob()).toBeNull();
    expect(capturedSignal?.aborted).toBe(false);
    expect(events.at(-1)?.type).toBe("complete");

    // Retained terminal job replays complete event to new subscriber immediately
    const replayEvents: AuditJobStreamEvent[] = [];
    const replaySub = manager.subscribe(startResult.job.id, (ev) => {
      replayEvents.push(ev);
    });
    expect(replaySub?.initialTerminal).toBe(true);
    expect(replayEvents).toHaveLength(1);
    expect(replayEvents[0]?.type).toBe("complete");

    // Unknown job returns null
    expect(manager.subscribe("nonexistent", () => {})).toBeNull();
    sub?.unsubscribe();
    replaySub?.unsubscribe();
    await manager.shutdown();
  });

  it("aborts an active job on shutdown(), preserves AuditCancelledError, and prevents persistence", async () => {
    const cancelErr = new AuditCancelledError("aborted by shutdown");
    const store = createLighthouseStore({
      db,
      artifactsDir,
    });
    const manager = createAuditJobManager({
      store,
      auditRunner: async (options) =>
        new Promise<LighthouseBatchExecutionResult>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => {
              reject(cancelErr);
            },
            { once: true },
          );
        }),
    });
    const res = manager.startJob(DEFAULT_REQUEST);
    if (!res.started) throw new Error("expected start");

    const events: AuditJobStreamEvent[] = [];
    manager.subscribe(res.job.id, (ev) => events.push(ev));

    await manager.shutdown();

    expect(manager.isShuttingDown).toBe(true);
    expect(store.listRuns()).toHaveLength(0);
    expect(events.at(-1)).toEqual({
      type: "error",
      data: {
        jobId: res.job.id,
        status: "failed",
        error: {
          code: cancelErr.code,
          message: "aborted by shutdown",
        },
      },
    });
  });

  it("propagates host AbortSignal cleanly during runner execution and before persistBatch writes", async () => {
    const hostController = new AbortController();
    let seenSignal: AbortSignal | undefined;
    const baseStore = createLighthouseStore({
      db,
      artifactsDir,
    });

    const manager = createAuditJobManager({
      store: baseStore,
      signal: hostController.signal,
      auditRunner: async (options) =>
        new Promise<LighthouseBatchExecutionResult>((_resolve, reject) => {
          seenSignal = options.signal;
          options.signal?.addEventListener(
            "abort",
            () => reject(new AuditCancelledError("host aborted")),
            { once: true },
          );
        }),
    });

    const res = manager.startJob(DEFAULT_REQUEST);
    if (!res.started) throw new Error("expected start");

    hostController.abort();
    await new Promise((r) => setTimeout(r, 15));

    expect(seenSignal?.aborted).toBe(true);
    expect(manager.isShuttingDown).toBe(true);
    expect(baseStore.listRuns()).toHaveLength(0);
    expect(() => manager.startJob(DEFAULT_REQUEST)).toThrow(
      "AuditJobManager is shutting down",
    );
    await manager.shutdown();

    // Signal abort racing right after auditRunner resolves is blocked by persistBatch({ signal })
    const lateController = new AbortController();
    const lateStore = createLighthouseStore({
      db,
      artifactsDir,
    });
    const lateManager = createAuditJobManager({
      store: lateStore,
      signal: lateController.signal,
      auditRunner: async () => {
        lateController.abort();
        return makeBatchResult();
      },
    });
    const lateStart = lateManager.startJob(DEFAULT_REQUEST);
    if (!lateStart.started) throw new Error("expected late start");

    const lateEvents: AuditJobStreamEvent[] = [];
    lateManager.subscribe(lateStart.job.id, (ev) => lateEvents.push(ev));
    await new Promise((r) => setTimeout(r, 15));

    expect(lateStore.listRuns()).toHaveLength(0);
    const lastEvent = lateEvents.at(-1);
    expect(lastEvent?.type).toBe("error");
    if (lastEvent?.type === "error") {
      expect(lastEvent.data.error.code).toBe(
        new AuditCancelledError("cancelled").code,
      );
    }
    await lateManager.shutdown();

    // Pre-aborted signal immediately marks manager shuttingDown
    const preAborted = new AbortController();
    preAborted.abort();
    const preAbortedManager = createAuditJobManager({
      store: baseStore,
      signal: preAborted.signal,
    });
    expect(preAbortedManager.isShuttingDown).toBe(true);
    expect(() => preAbortedManager.startJob(DEFAULT_REQUEST)).toThrow(
      "AuditJobManager is shutting down",
    );
    await preAbortedManager.shutdown();
  });

  it("wraps persistence failures into INTERNAL_ERROR, clears retained job after jobRetentionMs, and clears old retained job on next start", async () => {
    const throwingStore = createLighthouseStore({
      db,
      artifactsDir,
    });
    const failingStore: LighthouseStore = {
      ...throwingStore,
      persistBatch() {
        throw new Error("disk full");
      },
    };
    const errManager = createAuditJobManager({
      store: failingStore,
      auditRunner: async () => makeBatchResult(),
      jobRetentionMs: 80,
    });
    const failStart = errManager.startJob(DEFAULT_REQUEST);
    if (!failStart.started) throw new Error("expected failStart");

    const failEvents: AuditJobStreamEvent[] = [];
    let resolveFailEvent!: () => void;
    const failEventSeen = new Promise<void>((resolve) => {
      resolveFailEvent = resolve;
    });
    errManager.subscribe(failStart.job.id, (ev) => {
      failEvents.push(ev);
      if (ev.type === "error") {
        resolveFailEvent();
      }
    });
    await failEventSeen;

    expect(failEvents.at(-1)).toEqual({
      type: "error",
      data: {
        jobId: failStart.job.id,
        status: "failed",
        error: {
          code: API_ERROR_CODES.INTERNAL_ERROR,
          message: "Failed to persist completed audit results",
        },
      },
    });
    expect(errManager.hasJob(failStart.job.id)).toBe(true);

    // Wait deterministically for retention timer expiry
    const expiryDeadline = Date.now() + 1000;
    while (errManager.hasJob(failStart.job.id) && Date.now() < expiryDeadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(errManager.hasJob(failStart.job.id)).toBe(false);
    await errManager.shutdown();

    // AuditCancelledError thrown directly by persistBatch propagates without wrapping
    const abortCancelErr = new AuditCancelledError("aborted inside persist");
    const abortCancelStore: LighthouseStore = {
      ...throwingStore,
      persistBatch() {
        throw abortCancelErr;
      },
    };
    const cancelPersistManager = createAuditJobManager({
      store: abortCancelStore,
      auditRunner: async () => makeBatchResult(),
    });
    const cancelPersistStart = cancelPersistManager.startJob(DEFAULT_REQUEST);
    if (!cancelPersistStart.started) {
      throw new Error("expected cancelPersistStart");
    }
    const cancelPersistEvents: AuditJobStreamEvent[] = [];
    cancelPersistManager.subscribe(cancelPersistStart.job.id, (ev) =>
      cancelPersistEvents.push(ev),
    );
    await new Promise((r) => setTimeout(r, 15));
    expect(cancelPersistEvents.at(-1)).toEqual({
      type: "error",
      data: {
        jobId: cancelPersistStart.job.id,
        status: "failed",
        error: {
          code: abortCancelErr.code,
          message: "aborted inside persist",
        },
      },
    });
    await cancelPersistManager.shutdown();

    // Starting a second job clears previously retained job immediately
    const okStore = createLighthouseStore({
      db,
      artifactsDir,
    });
    const okManager = createAuditJobManager({
      store: okStore,
      auditRunner: async () => makeBatchResult(),
    });
    const first = okManager.startJob(DEFAULT_REQUEST);
    if (!first.started) throw new Error("expected first");
    await new Promise((r) => setTimeout(r, 15));
    expect(okManager.hasJob(first.job.id)).toBe(true);

    const second = okManager.startJob(DEFAULT_REQUEST);
    if (!second.started) throw new Error("expected second");
    expect(okManager.hasJob(first.job.id)).toBe(false);
    await okManager.shutdown();
  });

  it("preserves a replacement job started synchronously inside a complete subscriber across the prior job's finally cleanup", async () => {
    const store = createLighthouseStore({ db, artifactsDir });
    const firstDeferred = createDeferred();
    let secondAborted = false;
    let secondSettled = false;
    let resolveSecondStarted!: () => void;
    const secondStarted = new Promise<void>((resolve) => {
      resolveSecondStarted = resolve;
    });

    let runCount = 0;
    const manager = createAuditJobManager({
      store,
      auditRunner: async (opts) => {
        runCount += 1;
        if (runCount === 1) {
          return firstDeferred.promise;
        }
        resolveSecondStarted();
        return new Promise<LighthouseBatchExecutionResult>(
          (_resolve, reject) => {
            const finishAbort = () => {
              secondAborted = true;
              secondSettled = true;
              reject(new AuditCancelledError("second job aborted by shutdown"));
            };
            if (opts.signal?.aborted) {
              finishAbort();
              return;
            }
            opts.signal?.addEventListener("abort", finishAbort, { once: true });
          },
        );
      },
    });

    const first = manager.startJob(DEFAULT_REQUEST);
    if (!first.started) throw new Error("expected first");

    let secondStartResult: ReturnType<typeof manager.startJob> | undefined;
    let resolveFirstCompleted!: () => void;
    const firstCompleted = new Promise<void>((resolve) => {
      resolveFirstCompleted = resolve;
    });

    manager.subscribe(first.job.id, (ev) => {
      if (ev.type === "complete") {
        secondStartResult = manager.startJob({
          ...DEFAULT_REQUEST,
          url: "https://example.com/queued-sync",
        });
        resolveFirstCompleted();
      }
    });

    firstDeferred.resolve(makeBatchResult());
    await firstCompleted;
    await secondStarted;
    // Allow job 1's .finally() microtask to run before calling shutdown()
    await new Promise((r) => setTimeout(r, 0));

    expect(secondStartResult?.started).toBe(true);
    if (secondStartResult?.started) {
      expect(manager.getActiveJob()?.id).toBe(secondStartResult.job.id);
    }
    expect(secondAborted).toBe(false);
    expect(secondSettled).toBe(false);

    await manager.shutdown();
    expect(secondAborted).toBe(true);
    expect(secondSettled).toBe(true);
    expect(manager.getActiveJob()).toBeNull();
  });
});
