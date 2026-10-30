import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, type LighthouseRunRow } from "@devtools/db";
import { resolveArtifactsDir } from "./config";
import { InvalidAuditOptionsError, LighthouseExecutionError } from "./errors";
import { computeRepresentativeRun } from "./median";
import { normalizeLhr } from "./normalizer";
import { insertLighthouseRun } from "./repository";
import {
  DEFAULT_LIGHTHOUSE_CATEGORIES,
  LighthouseFormFactorSchema,
  LighthouseThrottlingMethodSchema,
  type ExecuteIterationParams,
  type NormalizedLighthouseRun,
  type RawLighthouseResult,
  type RunLighthouseAuditOptions,
  type SingleIterationResult,
  type WorkerPayload,
  type WorkerResultPayload,
} from "./types";
import type { WorkerOutboundMessage } from "./worker";

const DEFAULT_WORKER_SCRIPT_PATH = join(import.meta.dir, "worker.ts");

/**
 * Complete result returned by {@link runLighthouseAudit}.
 */
export interface LighthouseAuditExecutionResult {
  /** Canonical persisted row in `lighthouse_runs`. */
  run: LighthouseRunRow;
  /** Normalized category scores, Core Web Vitals, and warm summary JSON. */
  normalized: NormalizedLighthouseRun;
  /** Zero-based index of the selected Representative Run within the `--runs <N>` batch. */
  representativeRunIndex: number;
}

/**
 * Validates and normalizes `RunLighthouseAuditOptions`, throwing {@link InvalidAuditOptionsError}
 * when the URL scheme or run count is invalid.
 */
function validateAuditOptions(options: RunLighthouseAuditOptions): {
  url: string;
  formFactor: "mobile" | "desktop";
  throttlingMethod: "simulate" | "devtools" | "provided";
  runs: number;
  categories: readonly string[];
} {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(options.url);
  } catch {
    throw new InvalidAuditOptionsError(
      `Invalid target URL "${options.url}": must be a valid http:// or https:// URL`,
    );
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new InvalidAuditOptionsError(
      `Unsupported URL protocol "${parsedUrl.protocol}": only http: and https: are supported`,
    );
  }

  const runs = options.runs ?? 1;
  if (!Number.isInteger(runs) || runs < 1) {
    throw new InvalidAuditOptionsError(
      `Invalid runs count "${runs}": must be a positive integer (>= 1)`,
    );
  }

  const formFactor = LighthouseFormFactorSchema.parse(
    options.formFactor ?? "mobile",
  );
  const throttlingMethod = LighthouseThrottlingMethodSchema.parse(
    options.throttlingMethod ?? "simulate",
  );
  const categories =
    options.categories && options.categories.length > 0
      ? options.categories
      : DEFAULT_LIGHTHOUSE_CATEGORIES;

  return {
    url: parsedUrl.toString(),
    formFactor,
    throttlingMethod,
    runs,
    categories,
  };
}

/**
 * Parses a single JSON line emitted by the worker subprocess over `stdout`.
 */
function handleWorkerLine(
  line: string,
  onProgress: ExecuteIterationParams["onProgress"],
  state: {
    result: WorkerResultPayload | null;
    workerError: string | null;
  },
): void {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return;
  }
  try {
    const parsed = JSON.parse(trimmed) as WorkerOutboundMessage;
    if (parsed.type === "progress") {
      onProgress?.(parsed.event);
    } else if (parsed.type === "result") {
      state.result = parsed.result;
    } else if (parsed.type === "error") {
      state.workerError = parsed.message;
    }
  } catch {
    // Ignore non-protocol stdout lines from underlying libraries
  }
}

/**
 * Executes a single Lighthouse iteration inside an isolated child process.
 *
 * @remarks
 * Uses `Bun.spawn` child process isolation so CPU-bound trace analysis and Speedline decoding
 * never block the parent daemon event loop.
 *
 * @param params - Iteration execution parameters.
 * @param workerScriptPath - Optional path override to the worker script entrypoint.
 * @returns Completed {@link SingleIterationResult} from the child process.
 * @throws {@link LighthouseExecutionError} When the child process exits non-zero or emits an error.
 */
export async function executeIterationInSubprocess(
  params: ExecuteIterationParams,
  workerScriptPath: string = DEFAULT_WORKER_SCRIPT_PATH,
): Promise<SingleIterationResult> {
  const payload: WorkerPayload = {
    url: params.url,
    formFactor: params.formFactor,
    throttlingMethod: params.throttlingMethod,
    categories: params.categories,
    chromePath: params.chromePath,
    env: params.env,
    runIndex: params.runIndex,
    totalRuns: params.totalRuns,
  };

  const proc = Bun.spawn(
    [process.execPath, workerScriptPath, JSON.stringify(payload)],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const state: {
    result: WorkerResultPayload | null;
    workerError: string | null;
  } = {
    result: null,
    workerError: null,
  };

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of proc.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      handleWorkerLine(line, params.onProgress, state);
    }
  }
  if (buffer.trim()) {
    handleWorkerLine(buffer, params.onProgress, state);
  }

  const stderrText = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (state.workerError) {
    throw new LighthouseExecutionError(state.workerError);
  }

  if (exitCode !== 0 || !state.result) {
    const detail = stderrText.trim() || `worker exited with code ${exitCode}`;
    throw new LighthouseExecutionError(
      `Lighthouse worker subprocess failed: ${detail}`,
    );
  }

  const lhr = JSON.parse(state.result.reportJson) as RawLighthouseResult;

  return {
    lhr,
    reportJson: state.result.reportJson,
    reportHtml: state.result.reportHtml,
  };
}

/**
 * Executes a full Lighthouse v13 audit across `--runs <N>` iterations.
 *
 * @remarks
 * Orchestrates multi-run iterations, selects the single Representative Run via minimum squared
 * Euclidean distance to median FCP and Interactive, writes cold `report.json` and `report.html` artifacts
 * to `<artifactsDir>/<runId>/`, and persists one canonical row in `lighthouse_runs`.
 *
 * @param options - Audit target URL, form factor, throttling method, run count, and seams.
 * @returns Persisted {@link LighthouseRunRow}, normalized data, and representative run index.
 * @throws {@link InvalidAuditOptionsError} When `options.url` or `options.runs` is invalid.
 * @throws {@link LighthouseExecutionError} When the isolated worker subprocess fails.
 */
export async function runLighthouseAudit(
  options: RunLighthouseAuditOptions,
): Promise<LighthouseAuditExecutionResult> {
  const startTime = performance.now();
  const validated = validateAuditOptions(options);
  const executor = options.executor ?? executeIterationInSubprocess;
  const targetDb = options.db ?? getDb();

  const iterations: SingleIterationResult[] = [];
  for (let i = 0; i < validated.runs; i++) {
    const iterationResult = await executor({
      url: validated.url,
      formFactor: validated.formFactor,
      throttlingMethod: validated.throttlingMethod,
      categories: validated.categories,
      chromePath: options.chromePath,
      env: options.env,
      runIndex: i,
      totalRuns: validated.runs,
      onProgress: options.onProgress,
    });
    iterations.push(iterationResult);
  }

  const { representative, runIndex, medianMetadata } =
    computeRepresentativeRun(iterations);
  const normalized = normalizeLhr(representative.lhr, medianMetadata);

  const runId = randomUUID();
  const baseArtifactsDir = resolveArtifactsDir({
    customDir: options.artifactsDir,
    env: options.env,
  });
  const runArtifactDir = join(baseArtifactsDir, runId);
  mkdirSync(runArtifactDir, { recursive: true });

  const jsonReportPath = join(runArtifactDir, "report.json");
  const htmlReportPath = join(runArtifactDir, "report.html");
  writeFileSync(jsonReportPath, representative.reportJson, "utf-8");
  writeFileSync(htmlReportPath, representative.reportHtml, "utf-8");

  const durationMs = Math.max(1, Math.round(performance.now() - startTime));

  const run = insertLighthouseRun(targetDb, {
    id: runId,
    url: validated.url,
    finalUrl: normalized.finalUrl || validated.url,
    formFactor: validated.formFactor,
    throttlingMethod: validated.throttlingMethod,
    performanceScore: normalized.scores.performanceScore,
    accessibilityScore: normalized.scores.accessibilityScore,
    bestPracticesScore: normalized.scores.bestPracticesScore,
    seoScore: normalized.scores.seoScore,
    lcpMs: normalized.metrics.lcpMs,
    cls: normalized.metrics.cls,
    tbtMs: normalized.metrics.tbtMs,
    fcpMs: normalized.metrics.fcpMs,
    siMs: normalized.metrics.siMs,
    ttfbMs: normalized.metrics.ttfbMs,
    summaryJson: normalized.summary,
    jsonReportPath,
    htmlReportPath,
    durationMs,
  });

  options.onProgress?.({
    stage: "complete",
    message: `Lighthouse audit complete (${runId})`,
    runIndex,
    totalRuns: validated.runs,
  });

  return {
    run,
    normalized,
    representativeRunIndex: runIndex,
  };
}
