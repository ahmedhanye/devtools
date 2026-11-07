import {
  resolveBrowserPath,
  type BrowserResolution,
  type ResolveBrowserOptions,
} from "@devtools/browser";
import { resolveChromeSandboxDisabled } from "./config";
import { WorkerExecutionError } from "./errors";
import { ensureLighthouseVirtualFs } from "./virtual-fs";
import type {
  ExecuteIterationParams,
  LighthouseFormFactor,
  LighthouseProgressEvent,
  LighthouseThrottlingMethod,
  RawLighthouseResult,
  SingleIterationResult,
  WorkerPayload,
  WorkerResultPayload,
} from "./types";

export type { WorkerPayload };

/**
 * Discriminated JSON-Lines message emitted by the worker subprocess over `stdout`.
 */
export type WorkerOutboundMessage =
  | {
      type: "progress";
      event: LighthouseProgressEvent;
    }
  | {
      type: "result";
      result: WorkerResultPayload;
    }
  | {
      type: "error";
      message: string;
      code?: string;
    };

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
 * Injectable seams for {@link runWorkerIteration} to support hermetic unit tests.
 */
export interface WorkerIterationDependencies {
  onProgress?: (event: LighthouseProgressEvent) => void;
  resolveBrowser?: (
    options?: ResolveBrowserOptions,
  ) => Promise<BrowserResolution>;
  launchChrome?: (options: {
    chromePath: string;
    chromeFlags: string[];
    port: number;
    logLevel: "silent";
  }) => Promise<{ port: number; kill: () => Promise<void> | void }>;
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
  deps: WorkerIterationDependencies = {},
): Promise<SingleIterationResult> {
  const resolveBrowser = deps.resolveBrowser ?? resolveBrowserPath;
  const launchChrome =
    deps.launchChrome ??
    ((await import("chrome-launcher")).launch as unknown as NonNullable<
      WorkerIterationDependencies["launchChrome"]
    >);
  let runLh = deps.runLighthouse;
  if (!runLh) {
    ensureLighthouseVirtualFs();
    const { registerBundledModules } = await import("./bundled-modules");
    await registerBundledModules();
    runLh = (await import("lighthouse")).default as unknown as NonNullable<
      WorkerIterationDependencies["runLighthouse"]
    >;
  }
  const Launcher = (await import("chrome-launcher")).Launcher;

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

  emitStage("locating_browser", "Resolving Chromium executable");
  const browser = await resolveBrowser({
    chromePath: params.chromePath,
    env: params.env,
  });

  emitStage(
    "launching_browser",
    `Launching headless Chromium (${browser.version})`,
  );
  const disableSandbox = resolveChromeSandboxDisabled({
    disableSandbox: params.disableSandbox,
    env: params.env,
  });
  const chromeFlags = [
    ...Launcher.defaultFlags(),
    "--headless=new",
    ...(disableSandbox ? ["--no-sandbox"] : []),
    "--disable-gpu",
    "--disable-dev-shm-usage",
  ];

  const launchedChrome = await launchChrome({
    chromePath: browser.executablePath,
    chromeFlags,
    port: 0,
    logLevel: "silent",
  });

  const cleanupSignal = async (): Promise<void> => {
    await launchedChrome.kill();
  };
  process.once("SIGTERM", cleanupSignal);
  process.once("SIGINT", cleanupSignal);

  try {
    emitStage(
      "navigating",
      `Navigating to ${params.url} (run ${params.runIndex + 1}/${params.totalRuns})`,
    );

    const config = buildLighthouseConfig({
      formFactor: params.formFactor,
      throttlingMethod: params.throttlingMethod,
      categories: params.categories,
    });

    const runnerResult = await runLh(
      params.url,
      {
        port: launchedChrome.port,
        hostname: "127.0.0.1",
        output: ["json", "html"],
        logLevel: "silent",
        enableErrorReporting: false,
      },
      config,
    );

    if (!runnerResult || !runnerResult.lhr) {
      throw new WorkerExecutionError(
        "Lighthouse returned an empty runner result",
      );
    }

    emitStage("analyzing", "Analyzing trace and computing insights");
    emitStage("generating_report", "Generating JSON and HTML reports");

    const { reportJson, reportHtml } = extractReportStrings(
      runnerResult.lhr,
      runnerResult.report,
    );

    return {
      lhr: runnerResult.lhr,
      reportJson,
      reportHtml,
    };
  } finally {
    process.off("SIGTERM", cleanupSignal);
    process.off("SIGINT", cleanupSignal);
    await launchedChrome.kill();
  }
}

/**
 * @deprecated Use {@link executeIteration} instead.
 */
export const runWorkerIteration = executeIteration;
