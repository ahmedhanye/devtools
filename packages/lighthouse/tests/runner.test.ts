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
  executeIterationInSubprocess,
  getLighthouseRunById,
  InvalidAuditOptionsError,
  LighthouseExecutionError,
  listLighthouseRuns,
  runLighthouseAudit,
  type LighthouseProgressEvent,
  type SingleIterationResult,
  type WorkerPayload,
} from "../src";
import {
  buildLighthouseConfig,
  extractReportStrings,
  invokeWorkerEntrypoint,
  runWorkerIteration,
  runWorkerMain,
} from "../src/worker";

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

  it("buildLighthouseConfig constructs mobile and desktop configs with default 4 categories and throttling overrides", () => {
    const mobileCfg = buildLighthouseConfig({
      formFactor: "mobile",
      throttlingMethod: "simulate",
      categories: ["performance", "accessibility", "best-practices", "seo"],
    });
    expect(mobileCfg.extends).toBe("lighthouse:default");
    expect(mobileCfg.settings?.formFactor).toBe("mobile");
    expect(mobileCfg.settings?.throttlingMethod).toBe("simulate");
    expect(mobileCfg.settings?.onlyCategories).toEqual([
      "performance",
      "accessibility",
      "best-practices",
      "seo",
    ]);

    const desktopCfg = buildLighthouseConfig({
      formFactor: "desktop",
      throttlingMethod: "devtools",
      categories: ["performance"],
    });
    expect(desktopCfg.settings?.formFactor).toBe("desktop");
    expect(desktopCfg.settings?.throttlingMethod).toBe("devtools");
    expect(desktopCfg.settings?.screenEmulation?.mobile).toBe(false);
  });

  it("runWorkerIteration resolves browser, launches Chrome on port 0, runs Lighthouse with enableErrorReporting: false, and guarantees launchedChrome.kill() in finally", async () => {
    let chromeKilled = false;
    let capturedFlags: Record<string, unknown> | undefined;
    const stages: string[] = [];

    const payload: WorkerPayload = {
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

    const output = await runWorkerIteration(payload, {
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

  it("runWorkerIteration kills launched Chrome even when Lighthouse throws or returns undefined", async () => {
    let killedOnError = false;
    const payload: WorkerPayload = {
      url: "https://example.com",
      formFactor: "mobile",
      throttlingMethod: "simulate",
      categories: ["performance"],
      runIndex: 0,
      totalRuns: 1,
    };

    await expect(
      runWorkerIteration(payload, {
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

  it("runWorkerMain writes progress and result JSON lines and handles errors cleanly", async () => {
    const writtenLines: string[] = [];
    const mockIter = makeMockIterationResult(
      "https://example.com",
      800,
      1500,
      1200,
      95,
      "main-ok",
    );

    const payload: WorkerPayload = {
      url: "https://example.com",
      formFactor: "mobile",
      throttlingMethod: "simulate",
      categories: ["performance"],
      runIndex: 0,
      totalRuns: 1,
    };

    const codeOk = await runWorkerMain([JSON.stringify(payload)], {
      writeLine: (line) => writtenLines.push(line),
      executeIteration: async (_p, deps) => {
        deps?.onProgress?.({
          stage: "navigating",
          message: "Navigating",
          runIndex: 0,
          totalRuns: 1,
        });
        return {
          reportJson: mockIter.reportJson,
          reportHtml: mockIter.reportHtml,
        };
      },
    });
    expect(codeOk).toBe(0);
    expect(writtenLines).toHaveLength(2);
    expect(JSON.parse(writtenLines[0]!).type).toBe("progress");
    expect(JSON.parse(writtenLines[1]!).type).toBe("result");

    const errorLines: string[] = [];
    const codeErr = await runWorkerMain(["{ invalid json"], {
      writeLine: (line) => errorLines.push(line),
    });
    expect(codeErr).toBe(1);
    expect(JSON.parse(errorLines[0]!).type).toBe("error");

    const missingArgLines: string[] = [];
    const codeMissing = await runWorkerMain([], {
      writeLine: (line) => missingArgLines.push(line),
    });
    expect(codeMissing).toBe(1);
    expect(JSON.parse(missingArgLines[0]!).message).toContain(
      "Missing worker JSON payload argument",
    );

    // Verify runWorkerMain accepts payload via stdin seam
    const stdinLines: string[] = [];
    const codeStdin = await runWorkerMain([], {
      readStdin: async () => JSON.stringify(payload),
      writeLine: (line) => stdinLines.push(line),
      executeIteration: async () => ({
        reportJson: mockIter.reportJson,
        reportHtml: mockIter.reportHtml,
      }),
    });
    expect(codeStdin).toBe(0);
    expect(JSON.parse(stdinLines[0]!).type).toBe("result");

    // Verify extractReportStrings fallback when report is a single JSON string
    const fallbackReports = extractReportStrings(
      mockIter.lhr,
      mockIter.reportJson,
      () => "<html>rendered-fallback</html>",
    );
    expect(fallbackReports.reportJson).toBe(mockIter.reportJson);
    expect(fallbackReports.reportHtml).toBe("<html>rendered-fallback</html>");

    // Verify invokeWorkerEntrypoint sets exitCode on failure and resets cleanly
    const prevExitCode = process.exitCode;
    try {
      const entryCode = await invokeWorkerEntrypoint(["bad"], async () => 1);
      expect(entryCode).toBe(1);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = prevExitCode ?? 0;
    }
  });

  it("executeIterationInSubprocess spawns an isolated Bun child process, streams progress lines, and returns the iteration result or throws LighthouseExecutionError", async () => {
    const mockScriptPath = join(tempArtifactsDir, "mock-worker.ts");
    const mockResult = makeMockIterationResult(
      "https://example.com",
      790,
      1420,
      1180,
      97,
      "subprocess-ok",
    );

    await Bun.write(
      mockScriptPath,
      `
const raw = process.argv[2] || (await Bun.stdin.text()).trim();
const parsed = JSON.parse(raw);
if (parsed.url.includes("fail-worker")) {
  console.log(JSON.stringify({ type: "error", message: "Simulated worker crash" }));
  process.exit(1);
}
if (parsed.url.includes("crash-raw")) {
  console.error("Fatal stderr crash");
  process.exit(2);
}
if (parsed.url.includes("large-stderr")) {
  process.stderr.write("E".repeat(128 * 1024));
  process.stdout.write(JSON.stringify({
    type: "result",
    result: {
      reportJson: ${JSON.stringify(mockResult.reportJson)},
      reportHtml: ${JSON.stringify(mockResult.reportHtml)}
    }
  }));
  process.exit(0);
}
console.log("non-json banner line");
console.log("{ malformed json line");
console.log(JSON.stringify({
  type: "progress",
  event: { stage: "locating_browser", message: "Locating browser", runIndex: parsed.runIndex, totalRuns: parsed.totalRuns }
}));
process.stdout.write(JSON.stringify({
  type: "result",
  result: {
    reportJson: ${JSON.stringify(mockResult.reportJson)},
    reportHtml: ${JSON.stringify(mockResult.reportHtml)}
  }
}));
`,
    );

    const receivedStages: string[] = [];
    const subResult = await executeIterationInSubprocess(
      {
        url: "https://example.com",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        categories: ["performance"],
        runIndex: 0,
        totalRuns: 1,
        onProgress: (ev) => receivedStages.push(ev.stage),
      },
      mockScriptPath,
    );

    expect(receivedStages).toEqual(["locating_browser"]);
    expect(subResult.reportHtml).toContain("Report subprocess-ok");

    await expect(
      executeIterationInSubprocess(
        {
          url: "https://example.com/fail-worker",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          runIndex: 0,
          totalRuns: 1,
        },
        mockScriptPath,
      ),
    ).rejects.toThrow(LighthouseExecutionError);

    await expect(
      executeIterationInSubprocess(
        {
          url: "https://example.com/crash-raw",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          runIndex: 0,
          totalRuns: 1,
        },
        mockScriptPath,
      ),
    ).rejects.toThrow("Fatal stderr crash");

    const largeStderrResult = await executeIterationInSubprocess(
      {
        url: "https://example.com/large-stderr",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        categories: ["performance"],
        runIndex: 0,
        totalRuns: 1,
      },
      mockScriptPath,
    );
    expect(largeStderrResult.reportHtml).toContain("Report subprocess-ok");
  });

  it("runWorkerIteration handles SIGTERM cleanup listener", async () => {
    let killedViaSignal = false;
    const payload: WorkerPayload = {
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

    await runWorkerIteration(payload, {
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

  it("executes a live headless Chromium navigation audit against a local HTTP fixture", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(
          "<!doctype html><html><head><title>Live Fixture</title></head><body><main><h1 class='hero'>Live Heading</h1><p>Body text</p></main></body></html>",
          { headers: { "content-type": "text/html" } },
        );
      },
    });

    try {
      const fixtureUrl = `http://127.0.0.1:${server.port}/`;
      const progressEvents: LighthouseProgressEvent[] = [];

      const result = await runLighthouseAudit({
        url: fixtureUrl,
        formFactor: "desktop",
        throttlingMethod: "provided",
        runs: 1,
        artifactsDir: tempArtifactsDir,
        db,
        onProgress: (ev) => progressEvents.push(ev),
      });

      // Exactly 1 canonical row in lighthouse_runs
      const allRows = listLighthouseRuns(db);
      expect(allRows).toHaveLength(1);
      expect(result.run.id).toBe(allRows[0]!.id);
      expect(result.run.formFactor).toBe("desktop");
      expect(result.run.throttlingMethod).toBe("provided");
      expect(result.run.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.run.lcpMs).not.toBeNull();
      expect(result.run.fcpMs).not.toBeNull();

      // Exactly 1 pair of disk artifacts written for the run
      expect(existsSync(result.run.jsonReportPath)).toBe(true);
      expect(existsSync(result.run.htmlReportPath)).toBe(true);
      const rawHtml = readFileSync(result.run.htmlReportPath, "utf-8");
      expect(rawHtml).toContain("<!doctype html>");
      expect(rawHtml).toContain("</html>");

      // Verify lifecycle progress stages include navigating, analyzing, and complete
      expect(progressEvents.some((e) => e.stage === "navigating")).toBe(true);
      expect(progressEvents.some((e) => e.stage === "analyzing")).toBe(true);
      expect(progressEvents.at(-1)?.stage).toBe("complete");

      // Stored row is retrievable by ID
      const fetched = getLighthouseRunById(db, result.run.id);
      expect(fetched?.id).toBe(result.run.id);
    } finally {
      await server.stop(true);
    }
  }, 30000);
});
