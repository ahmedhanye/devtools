import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InvalidBrowserPathError } from "@devtools/browser";
import { closeAllDbs } from "@devtools/db";
import {
  AuditCancelledError,
  executeLighthouseBatch,
  InvalidAuditOptionsError,
  openLighthouseStore,
  type ExecuteIterationParams,
  type LighthouseProgressEvent,
  type LighthouseStore,
  type SingleIterationResult,
} from "../src";
import { executeIteration } from "../src/infra/runtime/iteration";

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

describe("LighthouseStore.runAudit & Isolated Worker Orchestration", () => {
  let store: LighthouseStore;
  let tempArtifactsDir: string;

  beforeEach(() => {
    tempArtifactsDir = join(
      tmpdir(),
      `devtools-lh-runner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempArtifactsDir, { recursive: true });
    store = openLighthouseStore({
      memory: true,
      artifactsDir: tempArtifactsDir,
    });
  });

  afterEach(() => {
    store.close();
    closeAllDbs();
    rmSync(tempArtifactsDir, { recursive: true, force: true });
  });

  it("validates URL and runs count before executing", async () => {
    await expect(store.runAudit({ url: "not-a-valid-url" })).rejects.toThrow(
      InvalidAuditOptionsError,
    );

    await expect(
      store.runAudit({ url: "ftp://example.com/file" }),
    ).rejects.toThrow(InvalidAuditOptionsError);

    await expect(
      store.runAudit({ url: "https://example.com", runs: 0 }),
    ).rejects.toThrow(InvalidAuditOptionsError);

    await expect(
      executeLighthouseBatch({
        url: "https://example.com",
        categories: ["invalid-category"],
      }),
    ).rejects.toThrow(InvalidAuditOptionsError);
  });

  it("splits executeLighthouseBatch (SQLite-free) and store.persistBatch cleanly", async () => {
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
    expect(store.listRuns()).toHaveLength(0);

    const persisted = store.persistBatch(batch, {
      artifactsDir: tempArtifactsDir,
      onProgress: (ev) => progress.push(ev),
    });

    expect(persisted.run.url).toBe("https://example.com/split");
    expect(persisted.previousRun).toBeNull();
    expect(existsSync(persisted.run.htmlReportPath)).toBe(true);
    expect(progress.map((e) => e.stage)).toEqual(["navigating", "complete"]);

    // Subsequent persistBatch returns the prior run as previousRun
    const secondPersisted = store.persistBatch(batch);
    expect(secondPersisted.previousRun?.id).toBe(persisted.run.id);
  });

  it("cleans up written cold artifact directory when DB write fails during persistBatch", () => {
    const closedStore = openLighthouseStore({
      memory: true,
      artifactsDir: tempArtifactsDir,
    });
    closedStore.ensureReady();
    closedStore.close();

    const batch = {
      validatedUrl: "https://example.com/rollback",
      formFactor: "mobile" as const,
      throttlingMethod: "simulate" as const,
      totalRuns: 1,
      normalized: {
        requestedUrl: "https://example.com/rollback",
        finalUrl: "https://example.com/rollback",
        scores: {
          performanceScore: 90,
          accessibilityScore: 95,
          bestPracticesScore: 95,
          seoScore: 95,
        },
        metrics: {
          lcpMs: 1200,
          cls: 0.01,
          tbtMs: 30,
          fcpMs: 700,
          siMs: 1000,
          ttfbMs: 80,
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
      reportHtml: "<html></html>",
      representativeRunIndex: 0,
      durationMs: 100,
    };

    expect(() => closedStore.persistBatch(batch)).toThrow(
      "Database handle is closed",
    );
    expect(readdirSync(tempArtifactsDir)).toHaveLength(0);
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

      const result = await store.runAudit({
        url: fixtureUrl,
        formFactor: "desktop",
        throttlingMethod: "provided",
        runs: 3,
        artifactsDir: tempArtifactsDir,
        onProgress: (ev) => progressEvents.push(ev),
        executor: async (params) => {
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

      const allRows = store.listRuns();
      expect(allRows).toHaveLength(1);
      expect(result.run.id).toBe(allRows[0]!.id);
      expect(result.previousRun).toBeNull();
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

      expect(existsSync(result.run.jsonReportPath)).toBe(true);
      expect(existsSync(result.run.htmlReportPath)).toBe(true);
      expect(readFileSync(result.run.htmlReportPath, "utf-8")).toContain(
        "Report iter-1-median",
      );

      expect(progressEvents.some((e) => e.stage === "navigating")).toBe(true);
      expect(progressEvents.at(-1)?.stage).toBe("complete");

      const fetched = store.getRun(result.run.id);
      expect(fetched.id).toBe(result.run.id);
    } finally {
      await server.stop(true);
    }
  });

  it("passes options.env to openLighthouseStore (auto-initializing empty DB)", async () => {
    const customDbPath = join(tempArtifactsDir, "isolated-test.db");

    const mockResult = makeMockIterationResult(
      "https://example.com/db-test",
      800,
      1500,
      1200,
      95,
      "db-test",
    );

    using customStore = openLighthouseStore({
      artifactsDir: tempArtifactsDir,
      env: {
        DEVTOOLS_DB_PATH: customDbPath,
        NODE_ENV: "test",
      },
    });

    const capturedEnvs: Array<Record<string, string | undefined> | undefined> =
      [];
    const mockBrowser = {
      executablePath: "/mock/chrome",
      version: "Chromium 136.0.0",
      source: "explicit" as const,
    };

    const result = await customStore.runAudit({
      url: "https://example.com/db-test",
      runs: 1,
      artifactsDir: tempArtifactsDir,
      browser: mockBrowser,
      executor: async (params) => {
        capturedEnvs.push(params.env);
        return mockResult;
      },
    });

    expect(result.run.url).toBe("https://example.com/db-test");
    expect(existsSync(customDbPath)).toBe(true);
    expect(capturedEnvs[0]).toEqual({
      DEVTOOLS_DB_PATH: customDbPath,
      NODE_ENV: "test",
    });

    await customStore.runAudit({
      url: "https://example.com/db-test",
      runs: 1,
      artifactsDir: tempArtifactsDir,
      browser: mockBrowser,
      env: {
        DEVTOOLS_DB_PATH: customDbPath,
        CUSTOM_OVERRIDE: "yes",
      },
      executor: async (params) => {
        capturedEnvs.push(params.env);
        return mockResult;
      },
    });

    expect(capturedEnvs[1]).toEqual({
      DEVTOOLS_DB_PATH: customDbPath,
      CUSTOM_OVERRIDE: "yes",
    });

    const persisted = customStore.persistBatch(
      {
        validatedUrl: "https://example.com/db-test-2",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        totalRuns: 1,
        normalized: result.normalized,
        reportJson: "{}",
        reportHtml: "<html></html>",
        representativeRunIndex: 0,
        durationMs: 50,
      },
      {
        artifactsDir: tempArtifactsDir,
      },
    );
    expect(persisted.run.url).toBe("https://example.com/db-test-2");
  });

  it("executeIteration passes handleSIGINT: false, registers zero process signal listeners, and guarantees launchedChrome.kill() in finally", async () => {
    let chromeKilled = false;
    let capturedFlags: Record<string, unknown> | undefined;
    let capturedHandleSigint: boolean | undefined;
    const stages: string[] = [];
    const sigtermBefore = process.listenerCount("SIGTERM");
    const sigintBefore = process.listenerCount("SIGINT");

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
        capturedHandleSigint = opts.handleSIGINT;
        // Must not attach global SIGINT/SIGTERM listeners inside headless packages
        expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
        expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
        return {
          port: 54321,
          kill: async () => {
            chromeKilled = true;
          },
        };
      },
      runLighthouse: async (_url, flags) => {
        capturedFlags = flags;
        expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
        expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
        return {
          lhr: mockResult.lhr,
          report: [mockResult.reportJson, mockResult.reportHtml],
        };
      },
    });

    expect(chromeKilled).toBe(true);
    expect(capturedHandleSigint).toBe(false);
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

  it("executeIteration propagates non-abort resolveBrowser failures and kills Chrome when Lighthouse fails", async () => {
    await expect(
      executeIteration(
        {
          url: "https://example.com",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          runIndex: 0,
          totalRuns: 1,
        },
        {
          resolveBrowser: async () => {
            throw new Error("No browser installed");
          },
        },
      ),
    ).rejects.toThrow("No browser installed");

    let killedOnError = false;
    await expect(
      executeIteration(
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
        },
      ),
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

  it("executeIteration rejects before browser resolution or Chrome launch when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("pre-aborted");

    let resolveBrowserCalled = false;
    let launchChromeCalled = false;

    await expect(
      executeIteration(
        {
          url: "https://example.com",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          runIndex: 0,
          totalRuns: 1,
          signal: controller.signal,
        },
        {
          resolveBrowser: async () => {
            resolveBrowserCalled = true;
            return {
              executablePath: "/mock/chrome",
              version: "Chrome 136",
              source: "explicit",
            };
          },
          launchChrome: async () => {
            launchChromeCalled = true;
            return { port: 44444, kill: async () => {} };
          },
        },
      ),
    ).rejects.toBeInstanceOf(AuditCancelledError);

    expect(resolveBrowserCalled).toBe(false);
    expect(launchChromeCalled).toBe(false);
  });

  it("executeIteration rejects with AuditCancelledError if signal aborts during resolveBrowser (returning or throwing)", async () => {
    const controllerReturn = new AbortController();
    let launchChromeCalled = false;

    await expect(
      executeIteration(
        {
          url: "https://example.com",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          runIndex: 0,
          totalRuns: 1,
          signal: controllerReturn.signal,
        },
        {
          resolveBrowser: async () => {
            controllerReturn.abort();
            return {
              executablePath: "/mock/chrome",
              version: "Chrome 136",
              source: "explicit",
            };
          },
          launchChrome: async () => {
            launchChromeCalled = true;
            return { port: 44444, kill: async () => {} };
          },
        },
      ),
    ).rejects.toBeInstanceOf(AuditCancelledError);

    expect(launchChromeCalled).toBe(false);

    const controllerThrow = new AbortController();
    await expect(
      executeIteration(
        {
          url: "https://example.com",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          runIndex: 0,
          totalRuns: 1,
          signal: controllerThrow.signal,
        },
        {
          resolveBrowser: async () => {
            controllerThrow.abort();
            throw new Error("aborted in resolver");
          },
        },
      ),
    ).rejects.toBeInstanceOf(AuditCancelledError);
  });

  it("executeIteration kills launchedChrome immediately if signal aborts while launchChrome is in flight", async () => {
    const controller = new AbortController();
    let killCount = 0;
    let runLighthouseCalled = false;

    await expect(
      executeIteration(
        {
          url: "https://example.com",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          runIndex: 0,
          totalRuns: 1,
          signal: controller.signal,
        },
        {
          resolveBrowser: async () => ({
            executablePath: "/mock/chrome",
            version: "Chrome 136",
            source: "explicit",
          }),
          launchChrome: async () => {
            controller.abort();
            return {
              port: 44444,
              kill: async () => {
                killCount += 1;
              },
            };
          },
          runLighthouse: async () => {
            runLighthouseCalled = true;
            return undefined;
          },
        },
      ),
    ).rejects.toBeInstanceOf(AuditCancelledError);

    expect(killCount).toBe(1);
    expect(runLighthouseCalled).toBe(false);
  });

  it("executeIteration kills Chrome via abort listener during runLighthouse, converts rejection to AuditCancelledError, and removes listener", async () => {
    const controller = new AbortController();
    let killCount = 0;
    let rejectRun!: (err: Error) => void;

    const signal = controller.signal;
    let addCalls = 0;
    let removeCalls = 0;
    const origAdd = signal.addEventListener.bind(signal);
    const origRemove = signal.removeEventListener.bind(signal);
    signal.addEventListener = ((...args: Parameters<typeof origAdd>) => {
      addCalls += 1;
      return origAdd(...args);
    }) as typeof signal.addEventListener;
    signal.removeEventListener = ((...args: Parameters<typeof origRemove>) => {
      removeCalls += 1;
      return origRemove(...args);
    }) as typeof signal.removeEventListener;

    const promise = executeIteration(
      {
        url: "https://example.com",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        categories: ["performance"],
        runIndex: 0,
        totalRuns: 1,
        signal,
      },
      {
        resolveBrowser: async () => ({
          executablePath: "/mock/chrome",
          version: "Chrome 136",
          source: "explicit",
        }),
        launchChrome: async () => ({
          port: 44444,
          kill: async () => {
            killCount += 1;
            rejectRun(new Error("Target closed"));
          },
        }),
        runLighthouse: async () =>
          new Promise((_, rej) => {
            rejectRun = rej;
            queueMicrotask(() => controller.abort());
          }),
      },
    );

    await expect(promise).rejects.toBeInstanceOf(AuditCancelledError);
    expect(killCount).toBeGreaterThanOrEqual(2);
    expect(addCalls).toBe(1);
    expect(removeCalls).toBe(1);
  });

  it("executeIteration rejects with AuditCancelledError if signal aborts before runLighthouse resolves normally, and removes listener on success", async () => {
    const controller = new AbortController();
    const stages: string[] = [];
    const mockIter = makeMockIterationResult(
      "https://example.com",
      800,
      1500,
      1200,
      90,
      "abort-before-resolve",
    );

    await expect(
      executeIteration(
        {
          url: "https://example.com",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          runIndex: 0,
          totalRuns: 1,
          signal: controller.signal,
          onProgress: (ev) => stages.push(ev.stage),
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
          runLighthouse: async () => {
            controller.abort();
            return {
              lhr: mockIter.lhr,
              report: [mockIter.reportJson, mockIter.reportHtml],
            };
          },
        },
      ),
    ).rejects.toBeInstanceOf(AuditCancelledError);

    expect(stages).not.toContain("analyzing");
    expect(stages).not.toContain("generating_report");

    const healthyController = new AbortController();
    let removed = 0;
    const origRemove = healthyController.signal.removeEventListener.bind(
      healthyController.signal,
    );
    healthyController.signal.removeEventListener = ((
      ...args: Parameters<typeof origRemove>
    ) => {
      removed += 1;
      return origRemove(...args);
    }) as typeof healthyController.signal.removeEventListener;

    const ok = await executeIteration(
      {
        url: "https://example.com",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        categories: ["performance"],
        runIndex: 0,
        totalRuns: 1,
        signal: healthyController.signal,
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
          lhr: mockIter.lhr,
          report: [mockIter.reportJson, mockIter.reportHtml],
        }),
      },
    );
    expect(ok.reportHtml).toBe(mockIter.reportHtml);
    expect(removed).toBe(1);
  });

  it("executeLighthouseBatch rejects pre-aborted signal without invoking executor", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;

    await expect(
      executeLighthouseBatch({
        url: "https://example.com",
        runs: 2,
        signal: controller.signal,
        executor: async () => {
          calls += 1;
          return makeMockIterationResult(
            "https://example.com",
            700,
            1200,
            1000,
            95,
            "unused",
          );
        },
      }),
    ).rejects.toBeInstanceOf(AuditCancelledError);

    expect(calls).toBe(0);
  });

  it("executeLighthouseBatch forwards signal, halts multi-run loop on abort, and prevents persistence in store.runAudit", async () => {
    const controller = new AbortController();
    const seenSignals: Array<AbortSignal | undefined> = [];
    let calls = 0;

    await expect(
      store.runAudit({
        url: "https://example.com/multi-abort",
        runs: 3,
        artifactsDir: tempArtifactsDir,
        signal: controller.signal,
        executor: async (params) => {
          calls += 1;
          seenSignals.push(params.signal);
          if (calls === 1) {
            controller.abort();
          }
          return makeMockIterationResult(
            params.url,
            700,
            1200,
            1000,
            95,
            `iter-${calls}`,
          );
        },
      }),
    ).rejects.toBeInstanceOf(AuditCancelledError);

    expect(calls).toBe(1);
    expect(seenSignals).toEqual([controller.signal]);
    expect(store.listRuns()).toHaveLength(0);
    expect(readdirSync(tempArtifactsDir)).toHaveLength(0);
  });

  it("executeLighthouseBatch resolves Chromium once across runs: 3, passes pre-resolved browser, and handles abort/failure paths", async () => {
    const resolvedBrowser = {
      executablePath: "/mock/chrome-batch",
      version: "Chrome 136.0.0",
      source: "explicit" as const,
    };
    let resolveCount = 0;
    const seenBrowsers: unknown[] = [];
    const stages: string[] = [];

    const batch = await executeLighthouseBatch({
      url: "https://example.com/batch-cache",
      runs: 3,
      chromePath: "/mock/chrome-batch",
      onProgress: (ev) => stages.push(ev.stage),
      resolveBrowser: async (opts) => {
        resolveCount += 1;
        expect(opts?.chromePath).toBe("/mock/chrome-batch");
        return resolvedBrowser;
      },
      executor: async (params) => {
        seenBrowsers.push(params.browser);
        return makeMockIterationResult(
          params.url,
          750,
          1400,
          1100,
          94,
          `batch-run-${params.runIndex}`,
        );
      },
    });

    expect(batch.totalRuns).toBe(3);
    expect(resolveCount).toBe(1);
    expect(stages.filter((stage) => stage === "locating_browser")).toHaveLength(
      1,
    );
    expect(seenBrowsers).toEqual([
      resolvedBrowser,
      resolvedBrowser,
      resolvedBrowser,
    ]);

    const abortController = new AbortController();
    await expect(
      executeLighthouseBatch({
        url: "https://example.com/batch-abort-resolve",
        signal: abortController.signal,
        resolveBrowser: async () => {
          abortController.abort();
          throw new Error("resolver interrupted");
        },
        executor: async () =>
          makeMockIterationResult("https://example.com", 1, 2, 3, 99, "unused"),
      }),
    ).rejects.toBeInstanceOf(AuditCancelledError);

    await expect(
      executeLighthouseBatch({
        url: "https://example.com/batch-invalid-chrome",
        chromePath: "/nonexistent/devtools-missing-chrome",
      }),
    ).rejects.toBeInstanceOf(InvalidBrowserPathError);
  });

  it("executeIteration skips locating_browser when params.browser is pre-resolved and propagates non-abort launch failures", async () => {
    const stages: string[] = [];
    const mockResult = makeMockIterationResult(
      "https://example.com/pre-resolved",
      700,
      1200,
      1000,
      95,
      "pre-resolved",
    );

    const output = await executeIteration(
      {
        url: "https://example.com/pre-resolved",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        categories: ["performance"],
        browser: {
          executablePath: "/mock/chrome-pre",
          version: "Chrome 136.0.0",
          source: "explicit",
        },
        runIndex: 0,
        totalRuns: 1,
        onProgress: (ev) => stages.push(ev.stage),
      },
      {
        launchChrome: async (opts) => {
          expect(opts.chromePath).toBe("/mock/chrome-pre");
          expect(opts.ignoreDefaultFlags).toBe(true);
          return { port: 44556, kill: async () => {} };
        },
        runLighthouse: async () => ({
          lhr: mockResult.lhr,
          report: [mockResult.reportJson, mockResult.reportHtml],
        }),
      },
    );

    expect(output.reportHtml).toBe(mockResult.reportHtml);
    expect(stages).toEqual([
      "launching_browser",
      "navigating",
      "analyzing",
      "generating_report",
    ]);

    await expect(
      executeIteration(
        {
          url: "https://example.com/launch-fail",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          browser: {
            executablePath: "/mock/chrome-pre",
            version: "Chrome 136.0.0",
            source: "explicit",
          },
          runIndex: 0,
          totalRuns: 1,
        },
        {
          launchChrome: async () => {
            throw new Error("Chrome process failed to spawn");
          },
          runLighthouse: async () => undefined,
        },
      ),
    ).rejects.toThrow("Chrome process failed to spawn");
  });

  it("executeIteration handles rejected and synchronously throwing kill() inside abort listener and retries in finally", async () => {
    for (const failureMode of ["reject", "throw"] as const) {
      const controller = new AbortController();
      let killCalls = 0;
      let rejectRun!: (err: Error) => void;

      const promise = executeIteration(
        {
          url: "https://example.com",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          runIndex: 0,
          totalRuns: 1,
          signal: controller.signal,
        },
        {
          resolveBrowser: async () => ({
            executablePath: "/mock/chrome",
            version: "Chrome 136",
            source: "explicit",
          }),
          launchChrome: async () => ({
            port: 44444,
            kill: () => {
              killCalls += 1;
              if (killCalls === 1) {
                if (failureMode === "reject") {
                  return Promise.reject(new Error("async kill failed"));
                }
                throw new Error("sync kill failed");
              }
              return Promise.resolve();
            },
          }),
          runLighthouse: async () =>
            new Promise((_, rej) => {
              rejectRun = rej;
              queueMicrotask(() => {
                controller.abort();
                setTimeout(() => rejectRun(new Error("aborted")), 5);
              });
            }),
        },
      );

      await expect(promise).rejects.toBeInstanceOf(AuditCancelledError);
      expect(killCalls).toBe(2);
    }
  });
});
