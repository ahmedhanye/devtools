import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, runMigrations, type DevtoolsDb } from "@devtools/db";
import type { LighthouseBatchExecutionResult } from "@devtools/lighthouse";
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
    expect(manager.getActiveJob()).toBeNull();

    const started = manager.startJob({
      url: "https://example.com/",
      formFactor: "mobile",
      throttlingMethod: "simulate",
      runs: 1,
      categories: ["performance"],
    });
    expect(started.started).toBe(true);
    if (!started.started) return;

    // Mutating returned snapshot must not mutate internal state
    started.job.categories.push("seo");
    const active = manager.getActiveJob();
    expect(active?.categories).toEqual(["performance"]);
    expect(capturedEnv).toEqual({ CUSTOM_ENV: "yes" });

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
});
