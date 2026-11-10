import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EnvMap } from "@devtools/core";
import { getDb, type DevtoolsDb, type LighthouseRunRow } from "@devtools/db";
import { resolveArtifactsDir } from "./config";
import { InvalidAuditOptionsError } from "./errors";
import { computeRepresentativeRun } from "./median";
import { normalizeLhr } from "./normalizer";
import { insertLighthouseRun } from "./repository";
import {
  normalizeLighthouseAuditRequest,
  TriggerLighthouseAuditRequestSchema,
  type LighthouseCategoryId,
  type LighthouseFormFactor,
  type LighthouseThrottlingMethod,
} from "./schemas";
import type {
  ExecuteIterationParams,
  LighthouseProgressEvent,
  NormalizedLighthouseRun,
  RunLighthouseAuditOptions,
  SingleIterationResult,
} from "./types";
import type { WorkerIterationDependencies } from "./worker";

/**
 * Executes a single isolated Lighthouse iteration directly in-process:
 * resolves the Chromium binary, launches headless Chrome, and runs Lighthouse.
 *
 * @param params - Iteration parameters.
 * @param deps - Optional injectable seams.
 * @returns Resulting LHR and HTML/JSON reports.
 */
export async function executeIteration(
  params: ExecuteIterationParams,
  deps?: WorkerIterationDependencies,
): Promise<SingleIterationResult> {
  const { executeIteration: exec } = await import("./worker");
  return exec(params, deps);
}

/**
 * Options for executing a SQLite-free multi-run Lighthouse batch via {@link executeLighthouseBatch}.
 */
export type ExecuteLighthouseBatchOptions = Omit<
  RunLighthouseAuditOptions,
  "db" | "artifactsDir"
>;

/**
 * Serializable intermediate output produced by {@link executeLighthouseBatch} before persistence.
 */
export interface LighthouseBatchExecutionResult {
  validatedUrl: string;
  formFactor: LighthouseFormFactor;
  throttlingMethod: LighthouseThrottlingMethod;
  totalRuns: number;
  normalized: NormalizedLighthouseRun;
  reportJson: string;
  reportHtml: string;
  representativeRunIndex: number;
  durationMs: number;
}

/**
 * Persistence options for {@link persistLighthouseAudit}.
 */
export interface PersistLighthouseAuditOptions {
  /** Optional target `@devtools/db` database instance. Defaults to singleton `getDb()`. */
  db?: DevtoolsDb;
  /** Optional explicit artifacts base directory override. */
  artifactsDir?: string;
  /** Optional isolated environment map seam overriding `process.env`. */
  env?: EnvMap;
  /** Optional progress callback receiving the `"complete"` stage notification. */
  onProgress?: (event: LighthouseProgressEvent) => void;
}

/**
 * Complete result returned by {@link runLighthouseAudit} and {@link persistLighthouseAudit}.
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
  const rawCategories =
    options.categories && options.categories.length > 0
      ? options.categories
      : undefined;

  const parsed = TriggerLighthouseAuditRequestSchema.safeParse({
    url: options.url,
    ...(options.formFactor !== undefined
      ? { formFactor: options.formFactor }
      : {}),
    ...(options.throttlingMethod !== undefined
      ? { throttlingMethod: options.throttlingMethod }
      : {}),
    ...(options.runs !== undefined ? { runs: options.runs } : {}),
    ...(rawCategories !== undefined ? { categories: rawCategories } : {}),
  });

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
 * Executes a multi-run Lighthouse batch (`--runs <N>`), selects the Representative Run,
 * and normalizes the LHR without touching SQLite or filesystem artifact storage.
 *
 * @param options - Audit target URL, emulation parameters, and optional executor seam.
 * @returns Serializable batch execution payload ready for parent-thread persistence.
 * @throws {@link InvalidAuditOptionsError} When `options` fails shared schema validation.
 * @throws {@link WorkerExecutionError} When browser launch or Lighthouse execution fails.
 */
export async function executeLighthouseBatch(
  options: ExecuteLighthouseBatchOptions,
): Promise<LighthouseBatchExecutionResult> {
  const startTime = performance.now();
  const validated = validateAuditOptions(options);
  const executor = options.executor ?? executeIteration;

  const iterations: SingleIterationResult[] = [];
  for (let i = 0; i < validated.runs; i++) {
    const iterationResult = await executor({
      url: validated.url,
      formFactor: validated.formFactor,
      throttlingMethod: validated.throttlingMethod,
      categories: validated.categories,
      chromePath: options.chromePath,
      disableSandbox: options.disableSandbox,
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
  const durationMs = Math.max(1, Math.round(performance.now() - startTime));

  return {
    validatedUrl: validated.url,
    formFactor: validated.formFactor,
    throttlingMethod: validated.throttlingMethod,
    totalRuns: validated.runs,
    normalized,
    reportJson: representative.reportJson,
    reportHtml: representative.reportHtml,
    representativeRunIndex: runIndex,
    durationMs,
  };
}

/**
 * Writes cold `report.json` and `report.html` artifacts to disk and inserts one canonical
 * `lighthouse_runs` row into SQLite on the caller thread.
 *
 * @param batch - Output from {@link executeLighthouseBatch}.
 * @param options - Optional database, artifacts directory, environment, and progress seams.
 * @returns Persisted {@link LighthouseRunRow}, normalized data, and representative run index.
 */
export function persistLighthouseAudit(
  batch: LighthouseBatchExecutionResult,
  options: PersistLighthouseAuditOptions = {},
): LighthouseAuditExecutionResult {
  const targetDb = options.db ?? getDb({ env: options.env });
  const runId = randomUUID();
  const baseArtifactsDir = resolveArtifactsDir({
    customDir: options.artifactsDir,
    env: options.env,
  });
  const runArtifactDir = join(baseArtifactsDir, runId);
  mkdirSync(runArtifactDir, { recursive: true });

  const jsonReportPath = join(runArtifactDir, "report.json");
  const htmlReportPath = join(runArtifactDir, "report.html");
  writeFileSync(jsonReportPath, batch.reportJson, "utf-8");
  writeFileSync(htmlReportPath, batch.reportHtml, "utf-8");

  const { normalized } = batch;
  const run = insertLighthouseRun(targetDb, {
    id: runId,
    url: batch.validatedUrl,
    finalUrl: normalized.finalUrl || batch.validatedUrl,
    formFactor: batch.formFactor,
    throttlingMethod: batch.throttlingMethod,
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
    durationMs: batch.durationMs,
  });

  options.onProgress?.({
    stage: "complete",
    message: `Lighthouse audit complete (${runId})`,
    runIndex: batch.representativeRunIndex,
    totalRuns: batch.totalRuns,
  });

  return {
    run,
    normalized,
    representativeRunIndex: batch.representativeRunIndex,
  };
}

/**
 * Executes a full Lighthouse v13 audit across `--runs <N>` iterations and persists artifacts and SQLite state.
 *
 * @param options - Audit target URL, form factor, throttling method, run count, and seams.
 * @returns Persisted {@link LighthouseRunRow}, normalized data, and representative run index.
 * @throws {@link InvalidAuditOptionsError} When `options` fails validation.
 * @throws {@link WorkerExecutionError} When browser launch or Lighthouse execution fails.
 */
export async function runLighthouseAudit(
  options: RunLighthouseAuditOptions,
): Promise<LighthouseAuditExecutionResult> {
  const batch = await executeLighthouseBatch(options);
  return persistLighthouseAudit(batch, options);
}
