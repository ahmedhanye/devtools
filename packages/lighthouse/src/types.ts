import { z } from "zod";
import type { EnvMap } from "@devtools/core";
import type { DevtoolsDb, LighthouseRunSummaryData } from "@devtools/db";

/**
 * Supported Lighthouse emulation form factors.
 */
export const LighthouseFormFactorSchema = z.enum(["mobile", "desktop"]);

/**
 * Type alias for {@link LighthouseFormFactorSchema}.
 */
export type LighthouseFormFactor = z.infer<typeof LighthouseFormFactorSchema>;

/**
 * Supported Lighthouse network and CPU throttling mechanisms.
 *
 * - `"simulate"`: Lantern mathematical simulation (default).
 * - `"devtools"`: Live CDP packet and CPU rate throttling.
 * - `"provided"`: Host-level or unthrottled network/CPU.
 */
export const LighthouseThrottlingMethodSchema = z.enum([
  "simulate",
  "devtools",
  "provided",
]);

/**
 * Type alias for {@link LighthouseThrottlingMethodSchema}.
 */
export type LighthouseThrottlingMethod = z.infer<
  typeof LighthouseThrottlingMethodSchema
>;

/**
 * Standard 4 Lighthouse category identifiers.
 */
export const LighthouseCategoryIdSchema = z.enum([
  "performance",
  "accessibility",
  "best-practices",
  "seo",
]);

/**
 * Type alias for {@link LighthouseCategoryIdSchema}.
 */
export type LighthouseCategoryId = z.infer<typeof LighthouseCategoryIdSchema>;

/**
 * Default Lighthouse categories audited when `onlyCategories` is omitted.
 *
 * @remarks
 * Explicitly restricts gathering to the 4 standard categories so Lighthouse v13.5.0's
 * experimental `agentic-browsing` gatherers do not execute unless requested.
 */
export const DEFAULT_LIGHTHOUSE_CATEGORIES: readonly LighthouseCategoryId[] = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;

/**
 * Bounding rectangle coordinates of a DOM element in viewport/page CSS pixels.
 */
export const ElementBoundingRectSchema = z
  .object({
    top: z.number(),
    bottom: z.number(),
    left: z.number(),
    right: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .strict();

/**
 * Type alias for {@link ElementBoundingRectSchema}.
 */
export type ElementBoundingRect = z.infer<typeof ElementBoundingRectSchema>;

/**
 * Normalized DOM element attribution extracted from Lighthouse `NodeValue` items.
 */
export const AttributedElementSchema = z
  .object({
    selector: z.string(),
    snippet: z.string().nullable(),
    nodeLabel: z.string().nullable(),
    path: z.string().nullable(),
    lhId: z.string().nullable(),
    boundingRect: ElementBoundingRectSchema.nullable(),
  })
  .strict();

/**
 * Type alias for {@link AttributedElementSchema}.
 */
export type AttributedElement = z.infer<typeof AttributedElementSchema>;

/**
 * Four Largest Contentful Paint (LCP) phase durations in milliseconds extracted from `lcp-breakdown-insight`.
 */
export const LcpPhaseBreakdownSchema = z
  .object({
    timeToFirstByteMs: z.number().nullable(),
    resourceLoadDelayMs: z.number().nullable(),
    resourceLoadDurationMs: z.number().nullable(),
    elementRenderDelayMs: z.number().nullable(),
  })
  .strict();

/**
 * Type alias for {@link LcpPhaseBreakdownSchema}.
 */
export type LcpPhaseBreakdown = z.infer<typeof LcpPhaseBreakdownSchema>;

/**
 * Root-cause attribution entry for a Cumulative Layout Shift (CLS) cluster item.
 */
export const ClsCulpritCauseSchema = z
  .object({
    cause: z.string(),
    url: z.string().nullable(),
    selector: z.string().nullable(),
  })
  .strict();

/**
 * Type alias for {@link ClsCulpritCauseSchema}.
 */
export type ClsCulpritCause = z.infer<typeof ClsCulpritCauseSchema>;

/**
 * Attributed DOM element contributing to Cumulative Layout Shift (CLS) paired with its shift score and causes.
 */
export const ClsCulpritSchema = z
  .object({
    element: AttributedElementSchema,
    score: z.number(),
    causes: z.array(ClsCulpritCauseSchema),
  })
  .strict();

/**
 * Type alias for {@link ClsCulpritSchema}.
 */
export type ClsCulprit = z.infer<typeof ClsCulpritSchema>;

const BaseAuditDiagnosticFields = {
  id: z.string(),
  title: z.string(),
  description: z.string(),
  score: z.number().nullable(),
  scoreDisplayMode: z.string(),
  displayValue: z.string().nullable(),
};

/**
 * Normalized Lighthouse v13 `*-insight` diagnostic item.
 */
export const LighthouseInsightItemSchema = z
  .object({
    ...BaseAuditDiagnosticFields,
    metricSavings: z.record(z.string(), z.number()),
    replacesAudits: z.array(z.string()),
  })
  .strict();

/**
 * Type alias for {@link LighthouseInsightItemSchema}.
 */
export type LighthouseInsightItem = z.infer<typeof LighthouseInsightItemSchema>;

/**
 * Compact actionable diagnostic for a non-insight failed or warning audit.
 */
export const LighthouseFailedAuditSchema = z
  .object({
    ...BaseAuditDiagnosticFields,
    category: z.string().nullable(),
  })
  .strict();

/**
 * Type alias for {@link LighthouseFailedAuditSchema}.
 */
export type LighthouseFailedAudit = z.infer<typeof LighthouseFailedAuditSchema>;

/**
 * Multi-run distribution metadata recorded when `--runs <N>` executes multiple iterations.
 */
export const LighthouseMedianMetadataSchema = z
  .object({
    totalRuns: z.number().int().min(1),
    selectedRunIndex: z.number().int().min(0),
    medianFcpMs: z.number(),
    medianInteractiveMs: z.number(),
    runDistances: z.array(
      z
        .object({
          runIndex: z.number().int().min(0),
          fcpMs: z.number(),
          interactiveMs: z.number(),
          distanceSquared: z.number(),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Type alias for {@link LighthouseMedianMetadataSchema}.
 */
export type LighthouseMedianMetadata = z.infer<
  typeof LighthouseMedianMetadataSchema
>;

/**
 * Warm structured summary JSON schema (`lighthouse_runs.summary_json`) persisted in SQLite.
 */
export const LighthouseRunSummaryDataSchema: z.ZodType<LighthouseRunSummaryData> =
  z
    .object({
      lcpElement: AttributedElementSchema.nullable(),
      lcpPhases: LcpPhaseBreakdownSchema.nullable(),
      clsCulprits: z.array(ClsCulpritSchema),
      insights: z.array(LighthouseInsightItemSchema),
      failedAudits: z.array(LighthouseFailedAuditSchema),
      runWarnings: z.array(z.string()),
      runtimeError: z
        .object({
          code: z.string(),
          message: z.string(),
        })
        .strict()
        .nullable(),
      medianMetadata: LighthouseMedianMetadataSchema.nullable(),
    })
    .strict();

/**
 * Normalized category scores (`0-100` integer or `null` when skipped/errored).
 */
export interface LighthouseCategoryScores {
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
}

/**
 * Normalized Core Web Vitals metrics extracted from a Lighthouse Result (LHR).
 */
export interface LighthouseCoreWebVitals {
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  siMs: number | null;
  ttfbMs: number | null;
}

/**
 * Complete normalized result extracted from a single Lighthouse v13 Result (`LHR`).
 */
export interface NormalizedLighthouseRun {
  requestedUrl: string;
  finalUrl: string;
  scores: LighthouseCategoryScores;
  metrics: LighthouseCoreWebVitals;
  summary: LighthouseRunSummaryData;
}

/**
 * Lifecycle progress stages emitted during an isolated Lighthouse audit run.
 */
export type LighthouseProgressStage =
  | "locating_browser"
  | "launching_browser"
  | "navigating"
  | "analyzing"
  | "generating_report"
  | "complete";

/**
 * Structured progress event emitted via `onProgress` callbacks during an audit run.
 */
export interface LighthouseProgressEvent {
  stage: LighthouseProgressStage;
  message: string;
  runIndex?: number;
  totalRuns?: number;
}

/**
 * Raw Lighthouse Result (LHR) minimal structural shape consumed by the normalizer and median calculator.
 */
export interface RawLhrAuditItem {
  id?: string;
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  numericValue?: number;
  numericUnit?: string;
  displayValue?: string;
  metricSavings?: Record<string, number>;
  guidanceLevel?: number;
  replacesAudits?: string[];
  details?: Record<string, unknown>;
}

/**
 * Minimal structural representation of a Lighthouse v13 Result (LHR) object.
 */
export interface RawLighthouseResult {
  requestedUrl?: string;
  finalDisplayedUrl?: string;
  finalUrl?: string;
  runWarnings?: string[];
  runtimeError?: {
    code?: string;
    message?: string;
  };
  categories?: Record<
    string,
    | {
        id?: string;
        title?: string;
        score?: number | null;
        auditRefs?: Array<{
          id?: string;
          weight?: number;
          group?: string;
        }>;
      }
    | undefined
  >;
  audits?: Record<string, RawLhrAuditItem | undefined>;
}

/**
 * Raw report strings emitted by the worker subprocess over IPC before parent LHR hydration.
 */
export interface WorkerResultPayload {
  /** Raw serialized JSON report string. */
  reportJson: string;
  /** Raw standalone HTML report string. */
  reportHtml: string;
}

/**
 * Output of a single Lighthouse iteration executed by the worker or injected executor seam.
 */
export interface SingleIterationResult {
  /** Parsed Lighthouse Result (LHR) object. */
  lhr: RawLighthouseResult;
  /** Raw serialized JSON report string. */
  reportJson: string;
  /** Raw standalone HTML report string. */
  reportHtml: string;
}

/**
 * Serializable payload passed to the isolated Lighthouse worker script (`worker.ts`).
 */
export interface WorkerPayload {
  url: string;
  formFactor: LighthouseFormFactor;
  throttlingMethod: LighthouseThrottlingMethod;
  categories: readonly string[];
  chromePath?: string;
  disableSandbox?: boolean;
  env?: EnvMap;
  runIndex: number;
  totalRuns: number;
}

/**
 * Input parameters passed to the single-iteration executor seam or child worker.
 */
export interface ExecuteIterationParams extends WorkerPayload {
  onProgress?: (event: LighthouseProgressEvent) => void;
}

/**
 * Injectable executor function signature for running a single Lighthouse iteration.
 */
export type LighthouseIterationExecutor = (
  params: ExecuteIterationParams,
) => Promise<SingleIterationResult>;

/**
 * Options for executing a full Lighthouse audit via `runLighthouseAudit`.
 */
export interface RunLighthouseAuditOptions {
  /** Target URL to audit (`http://` or `https://`). */
  url: string;
  /** Device emulation preset (`"mobile"` or `"desktop"`). Defaults to `"mobile"`. */
  formFactor?: LighthouseFormFactor;
  /** Network/CPU throttling method. Defaults to `"simulate"`. */
  throttlingMethod?: LighthouseThrottlingMethod;
  /** Number of audit iterations to run before selecting the Representative Run. Defaults to `1`. */
  runs?: number;
  /** Explicit list of Lighthouse categories to audit. Defaults to the 4 standard categories. */
  categories?: readonly string[];
  /** Optional explicit Chromium binary path override (`--chrome-path`). */
  chromePath?: string;
  /** Optional flag to force disable or enable Chromium sandboxing (`--no-sandbox`). */
  disableSandbox?: boolean;
  /** Optional explicit artifacts base directory override. */
  artifactsDir?: string;
  /** Optional isolated environment map seam overriding `process.env`. */
  env?: EnvMap;
  /** Optional target `@devtools/db` database instance. Defaults to singleton `getDb()`. */
  db?: DevtoolsDb;
  /** Optional progress callback invoked across audit stages and multi-run iterations. */
  onProgress?: (event: LighthouseProgressEvent) => void;
  /** Optional injectable single-iteration executor seam for hermetic unit testing. */
  executor?: LighthouseIterationExecutor;
}
