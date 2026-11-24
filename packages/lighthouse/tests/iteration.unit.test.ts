import { EventEmitter } from "node:events";
import { describe, expect, it } from "bun:test";
import type {
  BrowserResolution,
  ResolveBrowserOptions,
} from "@devtools/browser";
import { AuditCancelledError } from "../src";
import {
  executeBatchWithPorts,
  type ExecuteIterationParams,
} from "../src/application";
import type {
  LighthouseProgressEvent,
  RawLighthouseResult,
  SingleIterationResult,
} from "../src/contracts";
import { throwIfAborted } from "../src/domain";
import {
  buildLighthouseConfig,
  DESKTOP_THROTTLING,
  executeIteration,
  extractReportStrings,
  mapLighthouseStatusToProgress,
} from "../src/infra/runtime/iteration";
import { restoreLighthouseVirtualFs } from "../src/infra/runtime/virtual-fs";

describe("Lighthouse Iteration Pure Configuration & Report Helpers", () => {
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
    expect(desktopCfg.settings?.throttling).toEqual(DESKTOP_THROTTLING);
    expect(desktopCfg.settings?.screenEmulation?.mobile).toBe(false);
  });

  it("extractReportStrings extracts reports and handles single-string fallback cleanly", () => {
    const lhr = {
      requestedUrl: "https://example.com",
      finalDisplayedUrl: "https://example.com/",
    };
    const reportJson = JSON.stringify(lhr, null, 2);
    const reportHtml = "<!doctype html><html><body>Report</body></html>";

    const arrayResult = extractReportStrings(lhr, [reportJson, reportHtml]);
    expect(arrayResult.reportJson).toBe(reportJson);
    expect(arrayResult.reportHtml).toBe(reportHtml);

    const fallbackReports = extractReportStrings(
      lhr,
      reportJson,
      () => "<html>rendered-fallback</html>",
    );
    expect(fallbackReports.reportJson).toBe(reportJson);
    expect(fallbackReports.reportHtml).toBe("<html>rendered-fallback</html>");

    const nonStringFallback = extractReportStrings(
      lhr,
      undefined as unknown as string,
      () => "<html>rendered-undefined</html>",
    );
    expect(nonStringFallback.reportJson).toBe(reportJson);
    expect(nonStringFallback.reportHtml).toBe(
      "<html>rendered-undefined</html>",
    );
  });

  it("AuditCancelledError and throwIfAborted enforce structured cancellation metadata", () => {
    const reason = new Error("shutdown requested");
    const err = new AuditCancelledError("Audit stopped", { cause: reason });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AuditCancelledError");
    expect(err.code).toBe("AUDIT_CANCELLED");
    expect(err.exitCode).toBe(1);
    expect(err.cause).toBe(reason);

    expect(() => throwIfAborted(undefined)).not.toThrow();

    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();

    controller.abort(reason);
    let caught: unknown;
    try {
      throwIfAborted(controller.signal);
    } catch (thrown) {
      caught = thrown;
    }
    expect(caught).toBeInstanceOf(AuditCancelledError);
    expect((caught as AuditCancelledError).code).toBe("AUDIT_CANCELLED");
    expect((caught as AuditCancelledError).cause).toBe(reason);
  });
});

describe("executeBatchWithPorts & executeIteration option/abort seams", () => {
  const MOCK_BROWSER: BrowserResolution = {
    executablePath: "/mock/chromium",
    version: "Chromium 136.0.0",
    source: "explicit",
  };

  function makeSingleIterationResult(
    url = "https://example.com/",
  ): SingleIterationResult {
    const lhr: RawLighthouseResult = {
      finalDisplayedUrl: url,
      categories: {
        performance: { id: "performance", score: 0.92 },
        accessibility: { id: "accessibility", score: 1 },
        "best-practices": { id: "best-practices", score: 0.95 },
        seo: { id: "seo", score: 0.98 },
      },
      audits: {
        "first-contentful-paint": { numericValue: 750 },
        interactive: { numericValue: 1100 },
        "largest-contentful-paint": { numericValue: 1350 },
        "cumulative-layout-shift": { numericValue: 0.01 },
        "total-blocking-time": { numericValue: 40 },
        "speed-index": { numericValue: 1000 },
        "server-response-time": { numericValue: 35 },
      },
    };
    return {
      lhr,
      reportJson: JSON.stringify(lhr),
      reportHtml: "<html><body>ok</body></html>",
    };
  }

  it("aborts immediately after resolveBrowser returns normally when signal became aborted during resolution", async () => {
    const controller = new AbortController();
    let executorCalled = false;

    await expect(
      executeBatchWithPorts(
        {
          url: "https://example.com/",
          runs: 1,
          signal: controller.signal,
        },
        {
          resolveBrowser: async () => {
            controller.abort("cancelled during resolve");
            return MOCK_BROWSER;
          },
          executeIteration: async () => {
            executorCalled = true;
            return makeSingleIterationResult();
          },
        },
      ),
    ).rejects.toBeInstanceOf(AuditCancelledError);

    expect(executorCalled).toBe(false);
  });

  it("forwards env, signal, chromePath, and disableSandbox across resolveBrowser and executeIteration", async () => {
    const controller = new AbortController();
    const env = { CUSTOM_LH_ENV: "batch-val" };
    let capturedResolveOpts: ResolveBrowserOptions | undefined;
    let capturedIterParams: ExecuteIterationParams | undefined;

    const result = await executeBatchWithPorts(
      {
        url: "https://example.com/batch",
        runs: 1,
        chromePath: "/mock/chrome-bin",
        disableSandbox: false,
        env,
        signal: controller.signal,
      },
      {
        resolveBrowser: async (opts) => {
          capturedResolveOpts = opts;
          return MOCK_BROWSER;
        },
        executeIteration: async (params) => {
          capturedIterParams = params;
          return makeSingleIterationResult("https://example.com/batch");
        },
      },
    );

    expect(result.validatedUrl).toBe("https://example.com/batch");
    expect(capturedResolveOpts?.chromePath).toBe("/mock/chrome-bin");
    expect(capturedResolveOpts?.env).toEqual(env);
    expect(capturedResolveOpts?.signal).toBe(controller.signal);

    expect(capturedIterParams?.browser).toBe(MOCK_BROWSER);
    expect(capturedIterParams?.chromePath).toBe("/mock/chrome-bin");
    expect(capturedIterParams?.disableSandbox).toBe(false);
    expect(capturedIterParams?.env).toEqual(env);
    expect(capturedIterParams?.signal).toBe(controller.signal);
  });

  it("executeIteration forwards env, chromePath, and signal to resolveBrowser and launchBrowserSession and always kills Chrome", async () => {
    const controller = new AbortController();
    const env = { CHROME_NO_SANDBOX: "1", TRACE_TAG: "iter" };
    let capturedResolveOpts: ResolveBrowserOptions | undefined;
    let capturedLaunchFlags: string[] = [];
    let killCount = 0;

    const fakeLhr: RawLighthouseResult = makeSingleIterationResult().lhr;

    const iterResult = await executeIteration(
      {
        url: "https://example.com/iter",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        categories: ["performance"],
        chromePath: "/mock/iter-chrome",
        env,
        runIndex: 0,
        totalRuns: 1,
        signal: controller.signal,
      },
      {
        resolveBrowser: async (opts) => {
          capturedResolveOpts = opts;
          return MOCK_BROWSER;
        },
        launchChrome: async (opts) => {
          capturedLaunchFlags = opts.chromeFlags;
          return {
            port: 49333,
            kill: async () => {
              killCount += 1;
            },
          };
        },
        runLighthouse: async (_url, flags) => {
          expect(flags.port).toBe(49333);
          return {
            lhr: fakeLhr,
            report: [JSON.stringify(fakeLhr), "<html>iter</html>"],
          };
        },
      },
    );

    expect(iterResult.reportHtml).toBe("<html>iter</html>");
    expect(capturedResolveOpts?.chromePath).toBe("/mock/iter-chrome");
    expect(capturedResolveOpts?.env).toEqual(env);
    expect(capturedResolveOpts?.signal).toBe(controller.signal);
    expect(capturedLaunchFlags).toContain("--no-sandbox");
    expect(killCount).toBe(1);

    // Signal forwarded into launchBrowserSession kills active Chrome on abort during runLighthouse
    const abortController = new AbortController();
    let abortedKillCount = 0;
    await expect(
      executeIteration(
        {
          url: "https://example.com/abort",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          browser: MOCK_BROWSER,
          env: {},
          runIndex: 0,
          totalRuns: 1,
          signal: abortController.signal,
        },
        {
          launchChrome: async () => ({
            port: 49334,
            kill: async () => {
              abortedKillCount += 1;
            },
          }),
          runLighthouse: async () => {
            abortController.abort("stop mid-run");
            return {
              lhr: fakeLhr,
              report: [JSON.stringify(fakeLhr), "<html></html>"],
            };
          },
        },
      ),
    ).rejects.toBeInstanceOf(AuditCancelledError);

    expect(abortedKillCount).toBeGreaterThanOrEqual(1);
  });

  it("mapLighthouseStatusToProgress maps curated Lighthouse phases and ignores unrelated statuses", () => {
    expect(mapLighthouseStatusToProgress("Connecting to browser")).toEqual({
      stage: "navigating",
      message: "Connecting to headless Chrome",
    });
    expect(
      mapLighthouseStatusToProgress("Preparing network conditions"),
    ).toEqual({
      stage: "navigating",
      message: "Preparing browser cache and network conditions",
    });
    expect(mapLighthouseStatusToProgress("Cleaning browser cache")).toEqual({
      stage: "navigating",
      message: "Preparing browser cache and network conditions",
    });
    expect(mapLighthouseStatusToProgress("Getting artifact: Trace")).toEqual({
      stage: "analyzing",
      message: "Capturing page trace and artifacts",
    });
    expect(
      mapLighthouseStatusToProgress("Getting artifact: Accessibility"),
    ).toEqual({
      stage: "analyzing",
      message: "Collecting accessibility tree and DOM metrics",
    });
    expect(mapLighthouseStatusToProgress("Audit phase")).toEqual({
      stage: "analyzing",
      message: "Analyzing Core Web Vitals and running audits",
    });
    expect(
      mapLighthouseStatusToProgress("Analyzing and running audits..."),
    ).toEqual({
      stage: "analyzing",
      message: "Analyzing Core Web Vitals and running audits",
    });
    expect(
      mapLighthouseStatusToProgress("Auditing: Largest Contentful Paint"),
    ).toEqual({
      stage: "analyzing",
      message: "Analyzing Core Web Vitals and running audits",
    });
    expect(mapLighthouseStatusToProgress("Generating results...")).toEqual({
      stage: "analyzing",
      message: "Scoring categories and computing insights",
    });
    expect(
      mapLighthouseStatusToProgress("Navigating to https://example.com"),
    ).toBeNull();
  });

  it("executeIteration emits deduplicated curated milestones on live status events and detaches listener on error", async () => {
    const emitter = new EventEmitter();
    const events: LighthouseProgressEvent[] = [];
    const fakeLhr = makeSingleIterationResult().lhr;
    let capturedOutputFlag: unknown;

    const iterResult = await executeIteration(
      {
        url: "https://example.com/live",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        categories: ["performance"],
        browser: MOCK_BROWSER,
        runIndex: 0,
        totalRuns: 3,
        onProgress: (event) => {
          events.push(event);
        },
      },
      {
        statusEvents: emitter,
        launchChrome: async () => ({
          port: 49335,
          kill: async () => {},
        }),
        runLighthouse: async (_url, flags) => {
          capturedOutputFlag = flags.output;
          expect(emitter.listenerCount("status")).toBe(1);
          emitter.emit("status", ["status", "Connecting to browser"]);
          emitter.emit("status", ["status", "Cleaning browser cache"]);
          emitter.emit("status", ["status", "Preparing network conditions"]);
          emitter.emit("status", ["status", "Getting artifact: Trace"]);
          emitter.emit("status", ["status", "Getting artifact: DevtoolsLog"]);
          emitter.emit("status", ["status", "Getting artifact: Accessibility"]);
          emitter.emit("status", ["status", "Connecting to browser"]);
          emitter.emit("status", ["status", "Analyzing and running audits..."]);
          emitter.emit("status", [
            "status",
            "Auditing: First Contentful Paint",
          ]);
          emitter.emit("status", ["status", "Generating results..."]);
          return {
            lhr: fakeLhr,
            report: JSON.stringify(fakeLhr),
          };
        },
      },
    );

    expect(emitter.listenerCount("status")).toBe(0);
    expect(capturedOutputFlag).toBe("json");
    expect(iterResult.reportHtml).toBeUndefined();
    expect(events.map((e) => `${e.stage}:${e.message}`)).toEqual([
      "launching_browser:Launching headless Chromium (Chromium 136.0.0)",
      "navigating:Navigating to https://example.com/live",
      "navigating:Connecting to headless Chrome",
      "navigating:Preparing browser cache and network conditions",
      "analyzing:Capturing page trace and artifacts",
      "analyzing:Collecting accessibility tree and DOM metrics",
      "analyzing:Analyzing Core Web Vitals and running audits",
      "analyzing:Scoring categories and computing insights",
    ]);

    // Also detaches listener when runLighthouse throws
    await expect(
      executeIteration(
        {
          url: "https://example.com/fail",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          categories: ["performance"],
          browser: MOCK_BROWSER,
          runIndex: 0,
          totalRuns: 1,
        },
        {
          statusEvents: emitter,
          launchChrome: async () => ({
            port: 49336,
            kill: async () => {},
          }),
          runLighthouse: async () => {
            expect(emitter.listenerCount("status")).toBe(1);
            throw new Error("boom");
          },
        },
      ),
    ).rejects.toThrow("boom");

    expect(emitter.listenerCount("status")).toBe(0);
  });

  it("executeBatchWithPorts emits generating_report once at the end and renders HTML once for the representative run", async () => {
    const events: LighthouseProgressEvent[] = [];
    let htmlRenderCount = 0;

    const batch = await executeBatchWithPorts(
      {
        url: "https://example.com/multi",
        runs: 3,
        onProgress: (event) => {
          events.push(event);
        },
      },
      {
        resolveBrowser: async () => MOCK_BROWSER,
        executeIteration: async (params) => {
          const base = makeSingleIterationResult("https://example.com/multi");
          params.onProgress?.({
            stage: "launching_browser",
            message: "Launching",
            runIndex: params.runIndex,
            totalRuns: params.totalRuns,
          });
          params.onProgress?.({
            stage: "navigating",
            message: "Navigating",
            runIndex: params.runIndex,
            totalRuns: params.totalRuns,
          });
          params.onProgress?.({
            stage: "analyzing",
            message: "Analyzing",
            runIndex: params.runIndex,
            totalRuns: params.totalRuns,
          });
          return {
            lhr: base.lhr,
            reportJson: base.reportJson,
          };
        },
        generateHtmlReport: () => {
          htmlRenderCount += 1;
          return "<html><body>representative-html</body></html>";
        },
      },
    );

    expect(htmlRenderCount).toBe(1);
    expect(batch.reportHtml).toBe(
      "<html><body>representative-html</body></html>",
    );
    expect(events.map((e) => e.stage)).toEqual([
      "locating_browser",
      "launching_browser",
      "navigating",
      "analyzing",
      "launching_browser",
      "navigating",
      "analyzing",
      "launching_browser",
      "navigating",
      "analyzing",
      "generating_report",
    ]);
  });

  it("executeIteration loads Lighthouse runtime with standalone virtual FS on cold start and emits loading message", async () => {
    const events: LighthouseProgressEvent[] = [];
    try {
      await expect(
        executeIteration(
          {
            url: "https://example.com/cold-load",
            formFactor: "mobile",
            throttlingMethod: "simulate",
            categories: ["performance"],
            runIndex: 0,
            totalRuns: 1,
            onProgress: (event) => {
              events.push(event);
            },
          },
          {
            isStandalone: true,
            resolveBrowser: async () => {
              throw new Error("stop-after-load");
            },
          },
        ),
      ).rejects.toThrow("stop-after-load");

      expect(events[0]).toMatchObject({
        stage: "locating_browser",
        message: "Loading Lighthouse runtime...",
      });
    } finally {
      restoreLighthouseVirtualFs();
    }
  });
});
