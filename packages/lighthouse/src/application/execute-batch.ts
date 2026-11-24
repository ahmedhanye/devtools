import {
  InvalidAuditOptionsError,
  normalizeLighthouseAuditRequest,
  TriggerLighthouseAuditRequestSchema,
  type LighthouseBatchExecutionResult,
  type LighthouseCategoryId,
  type LighthouseFormFactor,
  type LighthouseThrottlingMethod,
  type SingleIterationResult,
} from "../contracts";
import {
  computeRepresentativeRun,
  normalizeLhr,
  throwIfAborted,
} from "../domain";
import type { ExecuteBatchPorts, ExecuteLighthouseBatchOptions } from "./ports";

function compactDefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Validates and normalizes audit execution options via {@link TriggerLighthouseAuditRequestSchema},
 * throwing {@link InvalidAuditOptionsError} on schema violation.
 */
function validateAuditOptions(options: ExecuteLighthouseBatchOptions): {
  url: string;
  formFactor: LighthouseFormFactor;
  throttlingMethod: LighthouseThrottlingMethod;
  runs: number;
  categories: LighthouseCategoryId[];
} {
  const categories =
    options.categories && options.categories.length > 0
      ? options.categories
      : undefined;

  const parsed = TriggerLighthouseAuditRequestSchema.safeParse(
    compactDefined({
      url: options.url,
      formFactor: options.formFactor,
      throttlingMethod: options.throttlingMethod,
      runs: options.runs,
      categories,
    }),
  );

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new InvalidAuditOptionsError(
      firstIssue?.message ?? "Invalid Lighthouse audit options",
      { cause: parsed.error },
    );
  }

  return normalizeLighthouseAuditRequest(parsed.data);
}

/**
 * Executes a multi-run Lighthouse batch (`--runs <N>`) using injected runtime ports,
 * selects the Representative Run, and normalizes the LHR without touching SQLite or artifacts.
 *
 * @param options - Audit target URL, emulation parameters, and optional executor seam.
 * @param ports - Runtime execution and browser discovery ports supplied by composition wiring.
 * @returns Serializable batch execution payload ready for parent-thread persistence.
 */
export async function executeBatchWithPorts(
  options: ExecuteLighthouseBatchOptions,
  ports: ExecuteBatchPorts,
): Promise<LighthouseBatchExecutionResult> {
  const startTime = performance.now();
  throwIfAborted(options.signal);
  const validated = validateAuditOptions(options);
  const executor = options.executor ?? ports.executeIteration;

  let resolvedBrowser = options.browser;
  if (!resolvedBrowser && (!options.executor || options.resolveBrowser)) {
    options.onProgress?.({
      stage: "locating_browser",
      message: "Resolving Chromium executable",
      runIndex: 0,
      totalRuns: validated.runs,
    });
    const resolveBrowser = options.resolveBrowser ?? ports.resolveBrowser;
    try {
      resolvedBrowser = await resolveBrowser({
        chromePath: options.chromePath,
        env: options.env,
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (err: unknown) {
      throwIfAborted(options.signal);
      throw err;
    }
    throwIfAborted(options.signal);
  }

  const iterations: SingleIterationResult[] = [];
  for (let i = 0; i < validated.runs; i++) {
    const iterationResult = await executor({
      url: validated.url,
      formFactor: validated.formFactor,
      throttlingMethod: validated.throttlingMethod,
      categories: validated.categories,
      browser: resolvedBrowser,
      chromePath: options.chromePath,
      disableSandbox: options.disableSandbox,
      env: options.env,
      runIndex: i,
      totalRuns: validated.runs,
      onProgress: options.onProgress,
      signal: options.signal,
    });
    throwIfAborted(options.signal);
    iterations.push(iterationResult);
  }

  const { representative, runIndex, medianMetadata } =
    computeRepresentativeRun(iterations);
  const normalized = normalizeLhr(representative.lhr, medianMetadata);

  options.onProgress?.({
    stage: "generating_report",
    message: "Generating JSON and HTML reports",
    runIndex: validated.runs - 1,
    totalRuns: validated.runs,
  });
  if (options.onProgress) {
    // Yield a macrotask so SSE flushes generating_report before synchronous HTML rendering.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    throwIfAborted(options.signal);
  }

  const reportHtml =
    representative.reportHtml ??
    (ports.generateHtmlReport
      ? await ports.generateHtmlReport(representative.lhr)
      : `<html><body><pre>${representative.reportJson}</pre></body></html>`);
  throwIfAborted(options.signal);

  const durationMs = Math.max(1, Math.round(performance.now() - startTime));

  return {
    validatedUrl: validated.url,
    formFactor: validated.formFactor,
    throttlingMethod: validated.throttlingMethod,
    totalRuns: validated.runs,
    normalized,
    reportJson: representative.reportJson,
    reportHtml,
    representativeRunIndex: runIndex,
    durationMs,
  };
}
