import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { API_ERROR_CODES } from "@devtools/core";
import { createDb, runMigrations, type DevtoolsDb } from "@devtools/db";
import {
  AuditCancelledError,
  listLighthouseRuns,
  type LighthouseBatchExecutionResult,
} from "@devtools/lighthouse";
import {
  AuditJobManager,
  type AuditJobStreamEvent,
} from "../src/lighthouse/job-manager";

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
        performanceScore: 93,
        accessibilityScore: 100,
        bestPracticesScore: 95,
        seoScore: 98,
      },
      metrics: {
        lcpMs: 1150,
        cls: 0.01,
        tbtMs: 20,
        fcpMs: 700,
        siMs: 1050,
        ttfbMs: 55,
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
    reportHtml: "<!doctype html><html><body>Job Unit</body></html>",
    representativeRunIndex: 0,
    durationMs: 800,
  };
}

const DEFAULT_REQUEST = {
  url: "https://example.com/",
  formFactor: "mobile" as const,
  throttlingMethod: "simulate" as const,
  runs: 1,
  categories: ["performance" as const],
};

describe("AuditJobManager (Unit)", () => {
  let db: DevtoolsDb;
  let artifactsDir: string;

  beforeEach(() => {
    db = createDb({ path: ":memory:" });
    runMigrations(db);
    artifactsDir = mkdtempSync(join(tmpdir(), "devtools-jm-unit-"));
  });

  afterEach(() => {
    rmSync(artifactsDir, { recursive: true, force: true });
  });

  it("returns null when subscribing to an unknown jobId and returns cloned job snapshots", async () => {
    let capturedEnv: Record<string, string | undefined> | undefined;
    let releaseRunner!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRunner = resolve;
    });

    const manager = new AuditJobManager({
      resolveDb: () => db,
      resolveArtifactsDir: () => artifactsDir,
      env: { CUSTOM_ENV: "yes" },
      auditRunner: async (params) => {
        capturedEnv = params.env;
        params.onProgress?.({
          stage: "launching_browser",
          message: "Launching browser",
        });
        await gate;
        return makeBatchResult(params.url);
      },
    });

    expect(manager.subscribe("nonexistent-id", () => {})).toBeNull();
    expect(manager.hasJob("nonexistent-id")).toBe(false);
    expect(manager.getActiveJob()).toBeNull();

    const started = manager.startJob(DEFAULT_REQUEST);
    expect(started.started).toBe(true);
    if (!started.started) return;

    // Mutating returned snapshot must not mutate internal state
    started.job.categories.push("seo");
    const active = manager.getActiveJob();
    expect(active?.categories).toEqual(["performance"]);
    expect(capturedEnv).toEqual({ CUSTOM_ENV: "yes" });
    expect(manager.hasJob(started.job.id)).toBe(true);

    // Progress event without optional runIndex/totalRuns omits those keys
    expect(active?.latestProgress?.stage).toBe("launching_browser");
    expect(active?.latestProgress?.runIndex).toBeUndefined();
    expect(active?.latestProgress?.totalRuns).toBeUndefined();

    const events: AuditJobStreamEvent[] = [];
    const sub = manager.subscribe(started.job.id, (ev) => events.push(ev));
    expect(sub).not.toBeNull();
    expect(sub?.initialTerminal).toBe(false);
    expect(events[0]?.type).toBe("progress");

    releaseRunner();
    await new Promise((r) => setTimeout(r, 15));
    expect(events.at(-1)?.type).toBe("complete");
    expect(manager.getActiveJob()).toBeNull();
  });

  it("enforces single-flight conflict, filters complete progress, forwards runIndex/totalRuns, and honors unsubscribe", async () => {
    let emitProgress!: (event: {
      stage: "navigating" | "complete";
      message: string;
      runIndex?: number;
      totalRuns?: number;
    }) => void;
    let releaseRunner!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRunner = resolve;
    });

    const manager = new AuditJobManager({
      resolveDb: () => db,
      resolveArtifactsDir: () => artifactsDir,
      auditRunner: async (params) => {
        emitProgress = (event) => params.onProgress?.(event);
        await gate;
        return makeBatchResult(params.url);
      },
    });

    const first = manager.startJob(DEFAULT_REQUEST);
    expect(first.started).toBe(true);
    if (!first.started) return;

    const conflict = manager.startJob(DEFAULT_REQUEST);
    expect(conflict).toEqual({ started: false, activeJobId: first.job.id });

    const retainedEvents: AuditJobStreamEvent[] = [];
    const unsubscribedEvents: AuditJobStreamEvent[] = [];
    manager.subscribe(first.job.id, (ev) => retainedEvents.push(ev));
    const subToRemove = manager.subscribe(first.job.id, (ev) =>
      unsubscribedEvents.push(ev),
    );
    expect(subToRemove?.initialTerminal).toBe(false);

    emitProgress({
      stage: "navigating",
      message: "Loading page",
      runIndex: 0,
      totalRuns: 2,
    });
    expect(retainedEvents).toHaveLength(1);
    expect(retainedEvents[0]).toMatchObject({
      type: "progress",
      data: {
        jobId: first.job.id,
        stage: "navigating",
        message: "Loading page",
        runIndex: 0,
        totalRuns: 2,
      },
    });
    expect(unsubscribedEvents).toHaveLength(1);

    // stage === "complete" from worker progress is filtered out
    emitProgress({ stage: "complete", message: "Finished" });
    expect(retainedEvents).toHaveLength(1);
    expect(manager.getActiveJob()?.latestProgress?.stage).toBe("navigating");

    // Unsubscribed listener stops receiving subsequent progress and terminal events
    subToRemove?.unsubscribe();
    releaseRunner();
    await new Promise((r) => setTimeout(r, 15));

    expect(unsubscribedEvents).toHaveLength(1);
    expect(retainedEvents).toHaveLength(2);
    expect(retainedEvents[1]?.type).toBe("complete");
  });

  it("replays terminal snapshot, expires retained jobs after retention window, and cancels prior retention timer on new job", async () => {
    const manager = new AuditJobManager({
      resolveDb: () => db,
      resolveArtifactsDir: () => artifactsDir,
      jobRetentionMs: 25,
      auditRunner: async (params) => makeBatchResult(params.url),
    });

    const first = manager.startJob(DEFAULT_REQUEST);
    expect(first.started).toBe(true);
    if (!first.started) return;

    await new Promise((r) => setTimeout(r, 10));
    expect(manager.hasJob(first.job.id)).toBe(true);

    // Late subscriber replays terminal snapshot immediately with initialTerminal: true
    const replayed: AuditJobStreamEvent[] = [];
    const replaySub = manager.subscribe(first.job.id, (ev) =>
      replayed.push(ev),
    );
    expect(replaySub?.initialTerminal).toBe(true);
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.type).toBe("complete");
    replaySub?.unsubscribe();

    // Starting a new job clears retained snapshot and cancels its retention timer
    const second = manager.startJob(DEFAULT_REQUEST);
    expect(second.started).toBe(true);
    if (!second.started) return;
    expect(manager.hasJob(first.job.id)).toBe(false);

    await new Promise((r) => setTimeout(r, 10));
    expect(manager.hasJob(second.job.id)).toBe(true);

    // Wait past retention window for second job to expire
    await new Promise((r) => setTimeout(r, 40));
    expect(manager.hasJob(second.job.id)).toBe(false);
    expect(manager.subscribe(second.job.id, () => {})).toBeNull();
  });

  it("transitions to failed, emits error event, and clears active job on runner rejection and persistence failure", async () => {
    let mode: "worker-error" | "persist-error" | "ok" = "worker-error";
    const manager = new AuditJobManager({
      resolveDb: () => {
        if (mode === "persist-error") {
          throw new Error("DB closed");
        }
        return db;
      },
      resolveArtifactsDir: () => artifactsDir,
      auditRunner: async (params) => {
        if (mode === "worker-error") {
          throw Object.assign(new Error("Chrome missing"), {
            code: "BROWSER_NOT_FOUND",
          });
        }
        return makeBatchResult(params.url);
      },
    });

    const runnerFail = manager.startJob(DEFAULT_REQUEST);
    expect(runnerFail.started).toBe(true);
    if (!runnerFail.started) return;

    const errEvents: AuditJobStreamEvent[] = [];
    manager.subscribe(runnerFail.job.id, (ev) => errEvents.push(ev));
    await new Promise((r) => setTimeout(r, 15));

    expect(manager.getActiveJob()).toBeNull();
    expect(errEvents).toHaveLength(1);
    expect(errEvents[0]).toEqual({
      type: "error",
      data: {
        jobId: runnerFail.job.id,
        status: "failed",
        error: {
          code: "BROWSER_NOT_FOUND",
          message: "Chrome missing",
        },
      },
    });

    // Persistence failure after runner succeeds also transitions cleanly to failed
    mode = "persist-error";
    const persistFail = manager.startJob(DEFAULT_REQUEST);
    expect(persistFail.started).toBe(true);
    if (!persistFail.started) return;

    const persistEvents: AuditJobStreamEvent[] = [];
    manager.subscribe(persistFail.job.id, (ev) => persistEvents.push(ev));
    await new Promise((r) => setTimeout(r, 15));

    expect(manager.getActiveJob()).toBeNull();
    expect(persistEvents).toHaveLength(1);
    expect(persistEvents[0]).toEqual({
      type: "error",
      data: {
        jobId: persistFail.job.id,
        status: "failed",
        error: {
          code: API_ERROR_CODES.INTERNAL_ERROR,
          message: "Failed to persist completed audit results",
        },
      },
    });

    // Subsequent job can still start cleanly after failure
    mode = "ok";
    const recovered = manager.startJob(DEFAULT_REQUEST);
    expect(recovered.started).toBe(true);
    await new Promise((r) => setTimeout(r, 15));
    expect(manager.getActiveJob()).toBeNull();
  });

  it("shutdown aborts active runner signal, awaits settlement, skips persistence, notifies subscribers, and rejects new jobs", async () => {
    let resolveDbCalls = 0;
    let runnerSettled = false;
    let capturedSignal: AbortSignal | undefined;
    let notifyStarted!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    let releaseRunner!: () => void;
    const runnerGate = new Promise<void>((resolve) => {
      releaseRunner = resolve;
    });

    const manager = new AuditJobManager({
      resolveDb: () => {
        resolveDbCalls += 1;
        return db;
      },
      resolveArtifactsDir: () => artifactsDir,
      auditRunner: async (params) => {
        capturedSignal = params.signal;
        notifyStarted();
        await runnerGate;
        // Simulate a runner that ignores abort and returns a batch anyway
        runnerSettled = true;
        return makeBatchResult(params.url);
      },
    });

    const started = manager.startJob(DEFAULT_REQUEST);
    expect(started.started).toBe(true);
    if (!started.started) return;

    await startedPromise;
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    const events: AuditJobStreamEvent[] = [];
    manager.subscribe(started.job.id, (ev) => events.push(ev));

    let shutdownCompleted = false;
    const shutdownPromise = (async () => {
      await manager.shutdown();
      shutdownCompleted = true;
    })();

    expect(capturedSignal?.aborted).toBe(true);
    // Late progress events after abort/shutdown are ignored
    expect(shutdownCompleted).toBe(false);

    await new Promise((r) => setTimeout(r, 10));
    expect(shutdownCompleted).toBe(false);
    expect(runnerSettled).toBe(false);

    releaseRunner();
    await shutdownPromise;

    expect(shutdownCompleted).toBe(true);
    expect(runnerSettled).toBe(true);
    expect(resolveDbCalls).toBe(0);
    expect(listLighthouseRuns(db)).toHaveLength(0);
    expect(readdirSync(artifactsDir)).toHaveLength(0);
    expect(manager.getActiveJob()).toBeNull();
    expect(manager.hasJob(started.job.id)).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("error");
    if (events[0]?.type === "error") {
      expect(events[0].data.error.code).toBe(
        new AuditCancelledError("cancelled").code,
      );
    }

    expect(() => manager.startJob(DEFAULT_REQUEST)).toThrow(/shutting down/i);

    // Calling shutdown again when idle resolves cleanly
    await expect(manager.shutdown()).resolves.toBeUndefined();
  });

  it("ignores late progress emissions once shutdown begins", async () => {
    let emitLateProgress!: () => void;
    let releaseRunner!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRunner = resolve;
    });

    const manager = new AuditJobManager({
      resolveDb: () => db,
      resolveArtifactsDir: () => artifactsDir,
      auditRunner: async (params) => {
        emitLateProgress = () =>
          params.onProgress?.({
            stage: "analyzing",
            message: "Late progress",
          });
        await gate;
        throw new AuditCancelledError("aborted");
      },
    });

    const started = manager.startJob(DEFAULT_REQUEST);
    expect(started.started).toBe(true);
    if (!started.started) return;

    const events: AuditJobStreamEvent[] = [];
    manager.subscribe(started.job.id, (ev) => events.push(ev));

    const shutdownPromise = manager.shutdown();
    emitLateProgress();
    expect(events).toHaveLength(0);

    releaseRunner();
    await shutdownPromise;
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("error");
  });
});
