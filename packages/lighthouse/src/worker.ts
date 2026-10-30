import {
  resolveBrowserPath,
  type BrowserResolution,
  type ResolveBrowserOptions,
} from "@devtools/browser";
import { Launcher, launch as defaultLaunchChrome } from "chrome-launcher";
import defaultRunLighthouse, {
  desktopConfig,
  generateReport as defaultGenerateReport,
} from "lighthouse";
import { resolveChromeSandboxDisabled } from "./config";
import { WorkerExecutionError } from "./errors";
import type {
  LighthouseFormFactor,
  LighthouseProgressEvent,
  LighthouseThrottlingMethod,
  RawLighthouseResult,
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
    const baseSettings =
      (desktopConfig as LighthouseConfigShape).settings ?? {};
    return {
      extends: "lighthouse:default",
      settings: {
        ...baseSettings,
        formFactor: "desktop",
        throttlingMethod: options.throttlingMethod,
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
  renderHtml: (
    lhr: Parameters<typeof defaultGenerateReport>[0],
    format: "html",
  ) => string = defaultGenerateReport,
): { reportJson: string; reportHtml: string } {
  if (Array.isArray(rawReport) && rawReport.length >= 2) {
    return {
      reportJson: String(rawReport[0]),
      reportHtml: String(rawReport[1]),
    };
  }
  const reportJson =
    typeof rawReport === "string" ? rawReport : JSON.stringify(lhr, null, 2);
  const reportHtml = renderHtml(
    lhr as Parameters<typeof defaultGenerateReport>[0],
    "html",
  );
  return { reportJson, reportHtml };
}

/**
 * Executes a single isolated Lighthouse iteration: resolves the Chromium binary via
 * `@devtools/browser`, launches headless Chrome on an ephemeral port (`port: 0`), runs
 * `lighthouse@13.5.0` with telemetry disabled (`enableErrorReporting: false`), and
 * guarantees `launchedChrome.kill()` inside a `finally` block.
 *
 * @param payload - Worker iteration parameters.
 * @param deps - Optional dependency injection seams for browser resolution, Chrome launch, and Lighthouse execution.
 * @returns The completed {@link WorkerResultPayload} containing the JSON and HTML reports.
 * @throws {@link WorkerExecutionError} When browser resolution fails, Chrome fails to launch, or Lighthouse returns an empty result.
 */
export async function runWorkerIteration(
  payload: WorkerPayload,
  deps: WorkerIterationDependencies = {},
): Promise<WorkerResultPayload> {
  const resolveBrowser = deps.resolveBrowser ?? resolveBrowserPath;
  const launchChrome =
    deps.launchChrome ??
    (defaultLaunchChrome as NonNullable<
      WorkerIterationDependencies["launchChrome"]
    >);
  const runLh =
    deps.runLighthouse ??
    (defaultRunLighthouse as unknown as NonNullable<
      WorkerIterationDependencies["runLighthouse"]
    >);

  const emitStage = (
    stage: LighthouseProgressEvent["stage"],
    message: string,
  ): void => {
    deps.onProgress?.({
      stage,
      message,
      runIndex: payload.runIndex,
      totalRuns: payload.totalRuns,
    });
  };

  emitStage("locating_browser", "Resolving Chromium executable");
  const browser = await resolveBrowser({
    chromePath: payload.chromePath,
    env: payload.env,
  });

  emitStage(
    "launching_browser",
    `Launching headless Chromium (${browser.version})`,
  );
  const disableSandbox = resolveChromeSandboxDisabled({
    disableSandbox: payload.disableSandbox,
    env: payload.env,
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
      `Navigating to ${payload.url} (run ${payload.runIndex + 1}/${payload.totalRuns})`,
    );

    const config = buildLighthouseConfig({
      formFactor: payload.formFactor,
      throttlingMethod: payload.throttlingMethod,
      categories: payload.categories,
    });

    const runnerResult = await runLh(
      payload.url,
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
 * Optional dependencies and I/O seams for {@link runWorkerMain}.
 */
export interface RunWorkerMainDeps {
  /** Line writer seam (defaults to `process.stdout.write`). */
  writeLine?: (line: string) => void;
  /** Iteration executor seam (defaults to `runWorkerIteration`). */
  executeIteration?: typeof runWorkerIteration;
  /** Stdin reader seam (defaults to `Bun.stdin.text` when invoked via entrypoint). */
  readStdin?: () => Promise<string>;
}

/**
 * CLI entrypoint for the isolated worker subprocess (`bun packages/lighthouse/src/worker.ts <jsonPayload>`).
 *
 * @param argv - Command-line arguments following the script path (`process.argv.slice(2)`).
 * @param deps - Optional output writer, iteration executor, and stdin reader seams for unit testing.
 * @returns Numeric exit code (`0` on success, `1` on error).
 */
export async function runWorkerMain(
  argv: readonly string[],
  deps: RunWorkerMainDeps = {},
): Promise<number> {
  const writeLine =
    deps.writeLine ?? ((line: string) => process.stdout.write(`${line}\n`));
  const executeIteration = deps.executeIteration ?? runWorkerIteration;

  const sendMessage = (msg: WorkerOutboundMessage): void => {
    writeLine(JSON.stringify(msg));
  };

  try {
    let rawArg = argv[0];
    if (!rawArg && deps.readStdin) {
      const stdinText = (await deps.readStdin()).trim();
      if (stdinText) {
        rawArg = stdinText;
      }
    }
    if (!rawArg) {
      throw new WorkerExecutionError("Missing worker JSON payload argument");
    }
    const payload = JSON.parse(rawArg) as WorkerPayload;
    const result = await executeIteration(payload, {
      onProgress: (event) => sendMessage({ type: "progress", event }),
    });
    sendMessage({ type: "result", result });
    return 0;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err &&
      typeof err === "object" &&
      "code" in err &&
      typeof err.code === "string"
        ? err.code
        : undefined;
    sendMessage({ type: "error", message, ...(code ? { code } : {}) });
    return 1;
  }
}

/**
 * Invokes {@link runWorkerMain} when `worker.ts` is executed as the main script and sets `process.exitCode` on failure.
 *
 * @param argv - Command-line arguments passed to the worker script.
 * @param mainFn - Optional {@link runWorkerMain} override seam for unit testing.
 * @returns Numeric exit code returned by `mainFn`.
 */
export async function invokeWorkerEntrypoint(
  argv: readonly string[] = process.argv.slice(2),
  mainFn: typeof runWorkerMain = runWorkerMain,
): Promise<number> {
  const code = await mainFn(argv, {
    readStdin: async () => {
      if (typeof Bun !== "undefined" && Bun.stdin) {
        return (await Bun.stdin.text()).trim();
      }
      return "";
    },
  });
  if (code !== 0) {
    process.exitCode = code;
  }
  return code;
}

if (import.meta.main) void invokeWorkerEntrypoint();
