import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDb,
  resetDb,
  runMigrations,
  type DevtoolsDb,
} from "@devtools/db";
import {
  executeIteration,
  executeLighthouseBatch,
  getLighthouseRunById,
  InvalidAuditOptionsError,
  listLighthouseRuns,
  persistLighthouseAudit,
  runLighthouseAudit,
  type ExecuteIterationParams,
  type LighthouseProgressEvent,
  type SingleIterationResult,
} from "../src";

function makeMockIterationResult(
  url: string,
  fcpMs: number,
  interactiveMs: number,
  lcpMs: number,
  perfScore: number,
  tag: string,
): SingleIterationResult {
  const lhr = {
    requestedUrl: url,
    finalDisplayedUrl: url,
    categories: {
      performance: { id: "performance", score: perfScore / 100 },
      accessibility: { id: "accessibility", score: 1 },
      "best-practices": { id: "best-practices", score: 0.95 },
      seo: { id: "seo", score: 0.98 },
    },
    audits: {
      "first-contentful-paint": { numericValue: fcpMs },
      interactive: { numericValue: interactiveMs },
      "largest-contentful-paint": { numericValue: lcpMs },
      "cumulative-layout-shift": { numericValue: 0.015 },
      "total-blocking-time": { numericValue: 55 },
      "speed-index": { numericValue: 1120 },
      "server-response-time": { numericValue: 42 },
      "lcp-breakdown-insight": {
        id: "lcp-breakdown-insight",
        title: "LCP breakdown",
        description: "Subparts",
        score: 0,
        scoreDisplayMode: "numeric",
        details: {
          type: "list",
          items: [
            {
              type: "table",
              items: [
                { subpart: "timeToFirstByte", duration: 42 },
                { subpart: "elementRenderDelay", duration: 120 },
              ],
            },
            {
              type: "node",
              selector: "main > h1.hero",
              snippet: `<h1 class="hero">${tag}</h1>`,
              nodeLabel: tag,
              lhId: "page-1-H1",
              boundingRect: {
                top: 10,
                bottom: 60,
                left: 10,
                right: 300,
                width: 290,
                height: 50,
              },
            },
          ],
        },
      },
    },
  };

  return {
    lhr,
    reportJson: JSON.stringify(lhr, null, 2),
    reportHtml: `<!doctype html><html><body>Report ${tag}</body></html>`,
  };
}

describe("runLighthouseAudit & Isolated Worker Orchestration", () => {
  let db: DevtoolsDb;
  let tempArtifactsDir: string;

  beforeEach(() => {
    db = createDb({ path: ":memory:" });
    runMigrations(db);
    tempArtifactsDir = join(
      tmpdir(),
      `devtools-lh-runner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempArtifactsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempArtifactsDir, { recursive: true, force: true });
  });

  it("validates URL and runs count before executing", async () => {
    await expect(
      runLighthouseAudit({ url: "not-a-valid-url", db }),
    ).rejects.toThrow(InvalidAuditOptionsError);

    await expect(
      runLighthouseAudit({ url: "ftp://example.com/file", db }),
    ).rejects.toThrow(InvalidAuditOptionsError);

    await expect(
      runLighthouseAudit({ url: "https://example.com", runs: 0, db }),
    ).rejects.toThrow(InvalidAuditOptionsError);

    await expect(
      executeLighthouseBatch({
        url: "https://example.com",
        categories: ["invalid-category"],
      }),
    ).rejects.toThrow(InvalidAuditOptionsError);
  });

  it("splits executeLighthouseBatch (SQLite-free) and persistLighthouseAudit cleanly", async () => {
    const progress: LighthouseProgressEvent[] = [];
    const mockIter = makeMockIterationResult(
      "https://example.com/split",
      720,
      1400,
      1150,
      96,
      "split-exec",
    );

    const batch = await executeLighthouseBatch({
      url: "https://example.com/split",
      formFactor: "desktop",
      throttlingMethod: "provided",
      categories: [],
      onProgress: (ev) => progress.push(ev),
      executor: async (params) => {
        params.onProgress?.({
          stage: "navigating",
          message: "Navigating",
          runIndex: 0,
          totalRuns: 1,
        });
        return mockIter;
      },
    });

    expect(batch.validatedUrl).toBe("https://example.com/split");
    expect(batch.normalized.scores.performanceScore).toBe(96);
    expect(listLighthouseRuns(db)).toHaveLength(0);

    const persisted = persistLighthouseAudit(batch, {
      db,
      artifactsDir: tempArtifactsDir,
      onProgress: (ev) => progress.push(ev),
    });

    expect(persisted.run.url).toBe("https://example.com/split");
    expect(existsSync(persisted.run.htmlReportPath)).toBe(true);
    expect(progress.map((e) => e.stage)).toEqual(["navigating", "complete"]);
  });

  it("executes a multi-run audit against a local HTTP fixture, selects 1 Representative Run, writes 1 report.{json,html} pair, and persists 1 row in SQLite", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(
          "<!doctype html><html><head><title>Fixture</title></head><body><main><h1 class='hero'>Hello</h1></main></body></html>",
          { headers: { "content-type": "text/html" } },
        );
      },
    });

    try {
      const fixtureUrl = `http://127.0.0.1:${server.port}/`;
      const progressEvents: LighthouseProgressEvent[] = [];

      const iterations = [
        makeMockIterationResult(fixtureUrl, 1200, 2200, 1900, 82, "iter-0"),
        makeMockIterationResult(
          fixtureUrl,
          850,
          1600,
          1350,
          94,
          "iter-1-median",
        ),
        makeMockIterationResult(fixtureUrl, 700, 1300, 1100, 98, "iter-2"),
      ];

      const result = await runLighthouseAudit({
        url: fixtureUrl,
        formFactor: "desktop",
        throttlingMethod: "provided",
        runs: 3,
        artifactsDir: tempArtifactsDir,
        db,
        onProgress: (ev) => progressEvents.push(ev),
        executor: async (params) => {
          // Verify local HTTP fixture responds during iteration
          const res = await fetch(params.url);
          expect(res.status).toBe(200);
          params.onProgress?.({
            stage: "locating_browser",
            message: "Locating Chromium",
            runIndex: params.runIndex,
            totalRuns: params.totalRuns,
          });
          params.onProgress?.({
            stage: "navigating",
            message: "Navigating",
            runIndex: params.runIndex,
            totalRuns: params.totalRuns,
          });
          return iterations[params.runIndex]!;
        },
      });

      // Exactly 1 canonical row in lighthouse_runs
      const allRows = listLighthouseRuns(db);
      expect(allRows).toHaveLength(1);
      expect(result.run.id).toBe(allRows[0]!.id);
      expect(result.run.performanceScore).toBe(94);
      expect(result.run.lcpMs).toBe(1350);
      expect(result.run.fcpMs).toBe(850);
      expect(result.run.formFactor).toBe("desktop");
      expect(result.run.throttlingMethod).toBe("provided");
      expect(result.run.summaryJson.lcpElement?.nodeLabel).toBe(
        "iter-1-median",
      );
      expect(result.run.summaryJson.medianMetadata?.totalRuns).toBe(3);
      expect(result.run.summaryJson.medianMetadata?.selectedRunIndex).toBe(1);

      // Exactly 1 pair of disk artifacts written for the Representative Run
      expect(existsSync(result.run.jsonReportPath)).toBe(true);
      expect(existsSync(result.run.htmlReportPath)).toBe(true);
      expect(readFileSync(result.run.htmlReportPath, "utf-8")).toContain(
        "Report iter-1-median",
      );

      // Progress events include complete stage
      expect(progressEvents.some((e) => e.stage === "navigating")).toBe(true);
      expect(progressEvents.at(-1)?.stage).toBe("complete");

      // Stored row is retrievable by ID
      const fetched = getLighthouseRunById(db, result.run.id);
      expect(fetched?.id).toBe(result.run.id);
    } finally {
      await server.stop(true);
    }
  });

  it("passes options.env to getDb to honor ADR-0002 database seam when db option is omitted", async () => {
    resetDb();
    const customDbPath = join(tempArtifactsDir, "isolated-test.db");
    const isolatedDb = createDb({ path: customDbPath });
    runMigrations(isolatedDb);

    try {
      const mockResult = makeMockIterationResult(
        "https://example.com/db-test",
        800,
        1500,
        1200,
        95,
        "db-test",
      );

      const result = await runLighthouseAudit({
        url: "https://example.com/db-test",
        runs: 1,
        artifactsDir: tempArtifactsDir,
        env: {
          DEVTOOLS_DB_PATH: customDbPath,
          NODE_ENV: "test",
        },
        executor: async () => mockResult,
      });

      expect(result.run.url).toBe("https://example.com/db-test");
      expect(existsSync(customDbPath)).toBe(true);
    } finally {
      resetDb();
    }
  });

  it("executeIteration resolves browser, launches Chrome on port 0, runs Lighthouse with enableErrorReporting: false, and guarantees launchedChrome.kill() in finally", async () => {
    let chromeKilled = false;
    let capturedFlags: Record<string, unknown> | undefined;
    const stages: string[] = [];

    const payload: ExecuteIterationParams = {
      url: "https://example.com",
      formFactor: "mobile",
      throttlingMethod: "simulate",
      categories: ["performance", "accessibility", "best-practices", "seo"],
      runIndex: 0,
      totalRuns: 1,
    };

    const mockResult = makeMockIterationResult(
      "https://example.com",
      800,
      1500,
      1200,
      96,
      "worker-unit",
    );

    const output = await executeIteration(payload, {
      onProgress: (ev) => stages.push(ev.stage),
      resolveBrowser: async () => ({
        executablePath: "/mock/chrome",
        version: "Chrome 136.0.0",
        source: "managed-cache",
      }),
      launchChrome: async (opts) => {
        expect(opts.chromePath).toBe("/mock/chrome");
        expect(opts.port).toBe(0);
        return {
          port: 54321,
          kill: async () => {
            chromeKilled = true;
          },
        };
      },
      runLighthouse: async (_url, flags) => {
        capturedFlags = flags as Record<string, unknown>;
        return {
          lhr: mockResult.lhr,
          report: [mockResult.reportJson, mockResult.reportHtml],
        };
      },
    });

    expect(chromeKilled).toBe(true);
    expect(capturedFlags?.port).toBe(54321);
    expect(capturedFlags?.enableErrorReporting).toBe(false);
    expect(output.reportHtml).toBe(mockResult.reportHtml);
    expect(stages).toEqual([
      "locating_browser",
      "launching_browser",
      "navigating",
      "analyzing",
      "generating_report",
    ]);
  });

  it("executeIteration kills launched Chrome even when Lighthouse throws or returns undefined", async () => {
    let killedOnError = false;
    const payload: ExecuteIterationParams = {
      url: "https://example.com",
      formFactor: "mobile",
      throttlingMethod: "simulate",
      categories: ["performance"],
      runIndex: 0,
      totalRuns: 1,
    };

    await expect(
      executeIteration(payload, {
        resolveBrowser: async () => ({
          executablePath: "/mock/chrome",
          version: "Chrome 136.0.0",
          source: "explicit",
        }),
        launchChrome: async () => ({
          port: 55555,
          kill: async () => {
            killedOnError = true;
          },
        }),
        runLighthouse: async () => undefined,
      }),
    ).rejects.toThrow("Lighthouse returned an empty runner result");

    expect(killedOnError).toBe(true);
  });

  it("executeIteration respects custom chromePath, disableSandbox, and emits all progress events", async () => {
    const stages: string[] = [];
    let capturedChromeFlags: string[] = [];

    const mockResult = makeMockIterationResult(
      "https://example.com/custom",
      790,
      1420,
      1180,
      97,
      "direct-exec",
    );

    const result = await executeIteration(
      {
        url: "https://example.com/custom",
        formFactor: "desktop",
        throttlingMethod: "provided",
        categories: ["performance"],
        chromePath: "/custom/bin/chrome",
        disableSandbox: true,
        runIndex: 0,
        totalRuns: 2,
        onProgress: (ev) => stages.push(ev.stage),
      },
      {
        resolveBrowser: async (opts) => {
          expect(opts?.chromePath).toBe("/custom/bin/chrome");
          return {
            executablePath: "/custom/bin/chrome",
            version: "Chrome 136.0.0",
            source: "explicit",
          };
        },
        launchChrome: async (opts) => {
          capturedChromeFlags = opts.chromeFlags;
          return {
            port: 54322,
            kill: async () => {},
          };
        },
        runLighthouse: async (_url, _flags, config) => {
          expect(config.settings?.formFactor).toBe("desktop");
          expect(config.settings?.throttlingMethod).toBe("provided");
          return {
            lhr: mockResult.lhr,
            report: [mockResult.reportJson, mockResult.reportHtml],
          };
        },
      },
    );

    expect(stages).toEqual([
      "locating_browser",
      "launching_browser",
      "navigating",
      "analyzing",
      "generating_report",
    ]);
    expect(capturedChromeFlags).toContain("--no-sandbox");
    expect(capturedChromeFlags).toContain("--headless=new");
    expect(result.lhr.requestedUrl).toBe("https://example.com/custom");
    expect(result.reportHtml).toBe(mockResult.reportHtml);
  });

  it("executeIteration cleans up SIGTERM and SIGINT listeners after completion or failure", async () => {
    const sigtermCountBefore = process.listenerCount("SIGTERM");
    const sigintCountBefore = process.listenerCount("SIGINT");

    const mockResult = makeMockIterationResult(
      "https://example.com",
      800,
      1500,
      1200,
      90,
      "cleanup-test",
    );

    await executeIteration(
      {
        url: "https://example.com",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        categories: ["performance"],
        runIndex: 0,
        totalRuns: 1,
      },
      {
        resolveBrowser: async () => ({
          executablePath: "/mock/chrome",
          version: "Chrome 136",
          source: "explicit",
        }),
        launchChrome: async () => ({
          port: 44444,
          kill: async () => {},
        }),
        runLighthouse: async () => ({
          lhr: mockResult.lhr,
          report: [mockResult.reportJson, mockResult.reportHtml],
        }),
      },
    );

    expect(process.listenerCount("SIGTERM")).toBe(sigtermCountBefore);
    expect(process.listenerCount("SIGINT")).toBe(sigintCountBefore);
  });

  it("executeIteration handles SIGTERM cleanup listener", async () => {
    let killedViaSignal = false;
    const payload: ExecuteIterationParams = {
      url: "https://example.com",
      formFactor: "mobile",
      throttlingMethod: "simulate",
      categories: ["performance"],
      runIndex: 0,
      totalRuns: 1,
    };
    const mockIter = makeMockIterationResult(
      "https://example.com",
      800,
      1500,
      1200,
      90,
      "sigterm-test",
    );

    await executeIteration(payload, {
      resolveBrowser: async () => ({
        executablePath: "/mock/chrome",
        version: "Chrome 136",
        source: "explicit",
      }),
      launchChrome: async () => ({
        port: 44444,
        kill: async () => {
          killedViaSignal = true;
        },
      }),
      runLighthouse: async () => {
        process.emit("SIGTERM", "SIGTERM");
        return {
          lhr: mockIter.lhr,
          report: [mockIter.reportJson, mockIter.reportHtml],
        };
      },
    });
    expect(killedViaSignal).toBe(true);
  });
});
