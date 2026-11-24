import {
  launchBrowserSession,
  resolveBrowserPath,
  type BrowserResolution,
  type BrowserSession,
  type BrowserSessionDependencies,
  type ResolveBrowserOptions,
} from "@devtools/browser";
import { isStandaloneRuntime } from "@devtools/core/node";
import type { generateReport as LighthouseGenerateReport } from "lighthouse";
import log from "lighthouse-logger";
import type { ExecuteIterationParams } from "../../application";
import {
  WorkerExecutionError,
  type LighthouseFormFactor,
  type LighthouseProgressEvent,
  type LighthouseThrottlingMethod,
  type RawLighthouseResult,
  type SingleIterationResult,
} from "../../contracts";
import { throwIfAborted } from "../../domain";
import { ensureLighthouseVirtualFs } from "./virtual-fs";

/**
 * Minimal structural shape of a Lighthouse configuration object (`LH.Config`).
 */
export interface LighthouseConfigShape {
  extends: "lighthouse:default";
  settings?: {
    formFactor?: LighthouseFormFactor;
    throttlingMethod?: LighthouseThrottlingMethod;
    throttling?: Record<string, unknown>;
    screenEmulation?: {
      mobile?: boolean;
      width?: number;
      height?: number;
      deviceScaleFactor?: number;
      disabled?: boolean;
    };
    emulatedUserAgent?: string | boolean;
    onlyCategories?: string[];
  };
}

/**
 * Minimal event-emitter interface for `lighthouse-logger`'s `log.events`.
 */
export interface StatusEventSource {
  on(event: string, listener: (payload: unknown) => void): unknown;
  off(event: string, listener: (payload: unknown) => void): unknown;
}

/**
 * Injectable seams for {@link executeIteration} to support hermetic unit tests.
 */
export interface IterationDependencies {
  onProgress?: (event: LighthouseProgressEvent) => void;
  resolveBrowser?: (
    options?: ResolveBrowserOptions,
  ) => Promise<BrowserResolution>;
  launchChrome?: BrowserSessionDependencies["launchChrome"];
  statusEvents?: StatusEventSource;
  isStandalone?: boolean;
  runLighthouse?: (
    url: string,
    flags: Record<string, unknown>,
    config: LighthouseConfigShape,
  ) => Promise<
    | {
        lhr: RawLighthouseResult;
        report: string | string[];
      }
    | undefined
  >;
}

interface LighthouseRuntime {
  runLh: NonNullable<IterationDependencies["runLighthouse"]>;
  generateReport: typeof LighthouseGenerateReport;
}

let cachedLighthouseRuntime: LighthouseRuntime | null = null;

/**
 * Clears the cached Lighthouse runtime module reference for hermetic cold-start tests.
 */
export function resetLighthouseRuntimeCache(): void {
  cachedLighthouseRuntime = null;
}

async function loadLighthouseRuntime(options?: {
  isStandalone?: boolean;
  onLoading?: () => void;
}): Promise<LighthouseRuntime> {
  if (cachedLighthouseRuntime) {
    return cachedLighthouseRuntime;
  }
  options?.onLoading?.();
  if (isStandaloneRuntime(options?.isStandalone)) {
    ensureLighthouseVirtualFs();
    const { registerBundledModules } = await import("./bundled-modules");
    await registerBundledModules();
  }
  const mod = await import("lighthouse");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Official lighthouse RunnerResult omits a TS index signature expected by RawLighthouseResult
  const runLh = mod.default as NonNullable<
    IterationDependencies["runLighthouse"]
  >;
  cachedLighthouseRuntime = { runLh, generateReport: mod.generateReport };
  return cachedLighthouseRuntime;
}

/**
 * Maps a `lighthouse-logger` status message to a curated {@link executeIteration} progress milestone.
 */
export function mapLighthouseStatusToProgress(message: string): {
  stage: "navigating" | "analyzing";
  message: string;
} | null {
  if (message === "Connecting to browser") {
    return { stage: "navigating", message: "Connecting to headless Chrome" };
  }
  if (message.startsWith("Preparing ") || message.startsWith("Cleaning ")) {
    return {
      stage: "navigating",
      message: "Preparing browser cache and network conditions",
    };
  }
  if (message === "Getting artifact: Accessibility") {
    return {
      stage: "analyzing",
      message: "Collecting accessibility tree and DOM metrics",
    };
  }
  if (message.startsWith("Getting artifact:")) {
    return {
      stage: "analyzing",
      message: "Capturing page trace and artifacts",
    };
  }
  if (
    message === "Audit phase" ||
    message === "Analyzing and running audits..." ||
    message.startsWith("Auditing:")
  ) {
    return {
      stage: "analyzing",
      message: "Analyzing Core Web Vitals and running audits",
    };
  }
  if (message === "Generating results...") {
    return {
      stage: "analyzing",
      message: "Scoring categories and computing insights",
    };
  }
  return null;
}

/**
 * Renders a standalone HTML report from a normalized/representative LHR using Lighthouse's
 * public `generateReport` API.
 */
export async function generateLighthouseHtmlReport(
  lhr: RawLighthouseResult,
): Promise<string> {
  const runtime = await loadLighthouseRuntime();
  return runtime.generateReport(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- RawLighthouseResult is a minimal structural subset of LH.Result accepted by ReportGenerator
    lhr as Parameters<typeof LighthouseGenerateReport>[0],
    "html",
  );
}

/**
 * Desktop throttling settings matching official Lighthouse `desktopDense4G`.
 */
export const DESKTOP_THROTTLING = {
  rttMs: 40,
  throughputKbps: 10 * 1024,
  cpuSlowdownMultiplier: 1,
  requestLatencyMs: 0,
  downloadThroughputKbps: 0,
  uploadThroughputKbps: 0,
} as const;

/**
 * Builds the Lighthouse v13 configuration object for a given form factor, throttling method,
 * and category list.
 *
 * @param options - Form factor, throttling method, and category identifiers.
 * @returns Configured {@link LighthouseConfigShape}.
 */
export function buildLighthouseConfig(options: {
  formFactor: LighthouseFormFactor;
  throttlingMethod: LighthouseThrottlingMethod;
  categories: readonly string[];
}): LighthouseConfigShape {
  const onlyCategories = [...options.categories];

  if (options.formFactor === "desktop") {
    return {
      extends: "lighthouse:default",
      settings: {
        formFactor: "desktop",
        throttlingMethod: options.throttlingMethod,
        throttling: DESKTOP_THROTTLING,
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
        emulatedUserAgent: false,
        onlyCategories,
      },
    };
  }

  return {
    extends: "lighthouse:default",
    settings: {
      formFactor: "mobile",
      throttlingMethod: options.throttlingMethod,
      onlyCategories,
    },
  };
}

/**
 * Normalizes `runnerResult.report` into `[jsonReport, htmlReport]` strings.
 *
 * @param lhr - Parsed Lighthouse Result object.
 * @param rawReport - Raw report string or `[jsonReport, htmlReport]` tuple returned by Lighthouse.
 * @param renderHtml - Optional HTML report generator seam for unit testing.
 * @returns Object containing `reportJson` and `reportHtml` strings.
 */
export function extractReportStrings(
  lhr: RawLighthouseResult,
  rawReport: string | string[],
  renderHtml?: (lhr: unknown, format: "html") => string,
): { reportJson: string; reportHtml: string } {
  if (Array.isArray(rawReport) && rawReport.length >= 2) {
    return {
      reportJson: String(rawReport[0]),
      reportHtml: String(rawReport[1]),
    };
  }
  const reportJson =
    typeof rawReport === "string" ? rawReport : JSON.stringify(lhr, null, 2);
  const reportHtml = renderHtml
    ? renderHtml(lhr, "html")
    : `<html><body><pre>${reportJson}</pre></body></html>`;
  return { reportJson, reportHtml };
}

async function runLighthouseWithStatus(options: {
  runLh: NonNullable<IterationDependencies["runLighthouse"]>;
  params: ExecuteIterationParams;
  port: number;
  statusEmitter: StatusEventSource;
  emitStage: (stage: LighthouseProgressEvent["stage"], message: string) => void;
}): Promise<SingleIterationResult> {
  const { runLh, params, port, statusEmitter, emitStage } = options;
  let reachedAnalyzing = false;
  let lastKey = "";
  const handleStatus = (payload: unknown): void => {
    const msg =
      Array.isArray(payload) && typeof payload[1] === "string"
        ? payload[1]
        : "";
    const mapped = mapLighthouseStatusToProgress(msg);
    if (!mapped || (reachedAnalyzing && mapped.stage === "navigating")) {
      return;
    }
    const key = `${mapped.stage}:${mapped.message}`;
    if (key === lastKey) {
      return;
    }
    lastKey = key;
    if (mapped.stage === "analyzing") {
      reachedAnalyzing = true;
    }
    emitStage(mapped.stage, mapped.message);
  };

  emitStage("navigating", `Navigating to ${params.url}`);
  const config = buildLighthouseConfig({
    formFactor: params.formFactor,
    throttlingMethod: params.throttlingMethod,
    categories: params.categories,
  });

  statusEmitter.on("status", handleStatus);
  let runnerResult: Awaited<ReturnType<typeof runLh>>;
  try {
    runnerResult = await runLh(
      params.url,
      {
        port,
        hostname: "127.0.0.1",
        output: "json",
        logLevel: "silent",
        enableErrorReporting: false,
      },
      config,
    );
  } finally {
    statusEmitter.off("status", handleStatus);
  }
  throwIfAborted(params.signal);

  if (!runnerResult || !runnerResult.lhr) {
    throw new WorkerExecutionError(
      "Lighthouse returned an empty runner result",
    );
  }
  if (!reachedAnalyzing) {
    emitStage("analyzing", "Analyzing Core Web Vitals and running audits");
  }

  const reportJson = Array.isArray(runnerResult.report)
    ? String(runnerResult.report[0])
    : typeof runnerResult.report === "string"
      ? runnerResult.report
      : JSON.stringify(runnerResult.lhr, null, 2);

  return {
    lhr: runnerResult.lhr,
    reportJson,
    ...(Array.isArray(runnerResult.report) && runnerResult.report.length >= 2
      ? { reportHtml: String(runnerResult.report[1]) }
      : {}),
  };
}

/**
 * Executes a single isolated Lighthouse iteration: resolves the Chromium binary via
 * `@devtools/browser`, launches headless Chrome on an ephemeral port (`port: 0`), runs
 * `lighthouse@13.5.0` with telemetry disabled (`enableErrorReporting: false`), and
 * guarantees `launchedChrome.kill()` inside a `finally` block.
 *
 * @param params - Iteration execution parameters.
 * @param deps - Optional dependency injection seams for browser resolution, Chrome launch, and Lighthouse execution.
 * @returns The completed {@link SingleIterationResult} containing the parsed LHR and JSON/HTML reports.
 * @throws {@link WorkerExecutionError} When browser resolution fails, Chrome fails to launch, or Lighthouse returns an empty result.
 */
export async function executeIteration(
  params: ExecuteIterationParams,
  deps: IterationDependencies = {},
): Promise<SingleIterationResult> {
  throwIfAborted(params.signal);

  const emitStage = (
    stage: LighthouseProgressEvent["stage"],
    message: string,
  ): void => {
    const onProgress = deps.onProgress ?? params.onProgress;
    onProgress?.({
      stage,
      message,
      runIndex: params.runIndex,
      totalRuns: params.totalRuns,
    });
  };

  let runLh = deps.runLighthouse;
  if (!runLh) {
    const runtime = await loadLighthouseRuntime({
      isStandalone: deps.isStandalone,
      onLoading: () => {
        emitStage("locating_browser", "Loading Lighthouse runtime...");
      },
    });
    runLh = runtime.runLh;
  }

  let browser = params.browser;
  if (!browser) {
    emitStage("locating_browser", "Resolving Chromium executable");
    const resolveBrowser = deps.resolveBrowser ?? resolveBrowserPath;
    try {
      browser = await resolveBrowser({
        chromePath: params.chromePath,
        env: params.env,
        ...(params.signal ? { signal: params.signal } : {}),
      });
    } catch (err: unknown) {
      throwIfAborted(params.signal);
      throw err;
    }
    throwIfAborted(params.signal);
  }

  emitStage(
    "launching_browser",
    `Launching headless Chromium (${browser.version})`,
  );

  let session: BrowserSession;
  try {
    session = await launchBrowserSession(
      {
        browser,
        disableSandbox: params.disableSandbox,
        env: params.env,
        signal: params.signal,
      },
      {
        launchChrome: deps.launchChrome,
      },
    );
  } catch (err: unknown) {
    throwIfAborted(params.signal);
    throw err;
  }

  try {
    return await runLighthouseWithStatus({
      runLh,
      params,
      port: session.port,
      statusEmitter: deps.statusEvents ?? log.events,
      emitStage,
    });
  } catch (err: unknown) {
    throwIfAborted(params.signal);
    throw err;
  } finally {
    await session.kill();
  }
}
