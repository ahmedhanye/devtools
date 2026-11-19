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
  RawLighthouseResult,
  SingleIterationResult,
} from "../src/contracts";
import { throwIfAborted } from "../src/domain";
import {
  buildLighthouseConfig,
  DESKTOP_THROTTLING,
  executeIteration,
  extractReportStrings,
} from "../src/infra/runtime/iteration";

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
});
