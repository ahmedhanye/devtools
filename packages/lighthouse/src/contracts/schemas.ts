import { z } from "zod";

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
 * Default Lighthouse categories audited when `categories` is omitted.
 *
 * @remarks
 * Explicitly restricts gathering to the 4 standard categories so Lighthouse v13
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
export const LighthouseRunSummaryDataSchema = z
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
 * Browser-safe Audit Summary payload type inferred from {@link LighthouseRunSummaryDataSchema}.
 */
export type LighthouseRunSummary = z.infer<
  typeof LighthouseRunSummaryDataSchema
>;

const CategoryScoreFields = {
  performanceScore: z.number().int().nullable(),
  accessibilityScore: z.number().int().nullable(),
  bestPracticesScore: z.number().int().nullable(),
  seoScore: z.number().int().nullable(),
};

const CoreWebVitalFields = {
  lcpMs: z.number().nullable(),
  cls: z.number().nullable(),
  tbtMs: z.number().nullable(),
  fcpMs: z.number().nullable(),
  siMs: z.number().nullable(),
  ttfbMs: z.number().nullable(),
};

/**
 * Normalized category scores (`0-100` integer or `null` when skipped/errored).
 */
export const LighthouseCategoryScoresSchema = z
  .object(CategoryScoreFields)
  .strict();

/**
 * Type alias for {@link LighthouseCategoryScoresSchema}.
 */
export type LighthouseCategoryScores = z.infer<
  typeof LighthouseCategoryScoresSchema
>;

/**
 * Normalized Core Web Vitals metrics extracted from a Lighthouse Result (LHR).
 */
export const LighthouseCoreWebVitalsSchema = z
  .object(CoreWebVitalFields)
  .strict();

/**
 * Type alias for {@link LighthouseCoreWebVitalsSchema}.
 */
export type LighthouseCoreWebVitals = z.infer<
  typeof LighthouseCoreWebVitalsSchema
>;

/**
 * Lifecycle progress stages emitted during an isolated Lighthouse audit run.
 */
export const LighthouseProgressStageSchema = z.enum([
  "locating_browser",
  "launching_browser",
  "navigating",
  "analyzing",
  "generating_report",
  "complete",
]);

/**
 * Type alias for {@link LighthouseProgressStageSchema}.
 */
export type LighthouseProgressStage = z.infer<
  typeof LighthouseProgressStageSchema
>;

/**
 * Target URL validator enforcing `http://` or `https://` parity across CLI and HTTP API boundaries.
 */
export const AuditTargetUrlSchema = z
  .string()
  .trim()
  .min(1, "Target URL is required")
  .superRefine((val, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(val);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: `Invalid target URL "${val}": must be a valid http:// or https:// URL`,
      });
      return;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message: `Unsupported URL protocol "${parsed.protocol}": only http: and https: are supported`,
      });
    }
  })
  .transform((val) => new URL(val).toString());

/**
 * Request body schema for `POST /api/lighthouse/audits` and shared audit option validation.
 */
export const TriggerLighthouseAuditRequestSchema = z
  .object({
    url: AuditTargetUrlSchema,
    formFactor: LighthouseFormFactorSchema.optional(),
    throttlingMethod: LighthouseThrottlingMethodSchema.optional(),
    runs: z.number().int().min(1).optional(),
    categories: z.array(LighthouseCategoryIdSchema).min(1).optional(),
  })
  .strict();

/**
 * Type alias for {@link TriggerLighthouseAuditRequestSchema}.
 */
export type TriggerLighthouseAuditRequest = z.infer<
  typeof TriggerLighthouseAuditRequestSchema
>;

/**
 * Normalized audit execution parameters with defaults applied.
 */
export interface NormalizedLighthouseAuditRequest {
  url: string;
  formFactor: LighthouseFormFactor;
  throttlingMethod: LighthouseThrottlingMethod;
  runs: number;
  categories: LighthouseCategoryId[];
}

/**
 * Applies canonical defaults to a validated {@link TriggerLighthouseAuditRequest}.
 *
 * @param input - Validated request or CLI option payload.
 * @returns Fully populated audit parameters with defaults resolved.
 */
export function normalizeLighthouseAuditRequest(
  input: TriggerLighthouseAuditRequest,
): NormalizedLighthouseAuditRequest {
  return {
    url: input.url,
    formFactor: input.formFactor ?? "mobile",
    throttlingMethod: input.throttlingMethod ?? "simulate",
    runs: input.runs ?? 1,
    categories:
      input.categories && input.categories.length > 0
        ? [...input.categories]
        : [...DEFAULT_LIGHTHOUSE_CATEGORIES],
  };
}

function parseQueryInt(val: unknown): unknown {
  if (val === undefined || typeof val === "number") {
    return val;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (/^-?\d+$/.test(trimmed)) {
      return Number.parseInt(trimmed, 10);
    }
  }
  return val;
}

/**
 * Query parameter schema for `GET /api/lighthouse/runs`.
 */
export const ListLighthouseRunsQuerySchema = z
  .object({
    url: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
    formFactor: LighthouseFormFactorSchema.optional(),
    limit: z
      .preprocess(parseQueryInt, z.number().int().min(1).max(100))
      .optional(),
    offset: z.preprocess(parseQueryInt, z.number().int().min(0)).optional(),
  })
  .strict();

/**
 * Type alias for {@link ListLighthouseRunsQuerySchema}.
 */
export type ListLighthouseRunsQuery = z.infer<
  typeof ListLighthouseRunsQuerySchema
>;

/**
 * Sanitized historical Audit Run projection returned inside paginated list responses.
 *
 * @remarks
 * Omits heavy `summaryJson` and internal host disk paths (`jsonReportPath`, `htmlReportPath`).
 */
export const LighthouseRunListItemSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    finalUrl: z.string(),
    formFactor: LighthouseFormFactorSchema,
    throttlingMethod: LighthouseThrottlingMethodSchema,
    performanceScore: z.number().int().nullable(),
    accessibilityScore: z.number().int().nullable(),
    bestPracticesScore: z.number().int().nullable(),
    seoScore: z.number().int().nullable(),
    lcpMs: z.number().nullable(),
    cls: z.number().nullable(),
    tbtMs: z.number().nullable(),
    fcpMs: z.number().nullable(),
    siMs: z.number().nullable(),
    ttfbMs: z.number().nullable(),
    durationMs: z.number().int(),
    createdAt: z.string().datetime(),
    hasHtmlReport: z.boolean(),
  })
  .strict();

/**
 * Type alias for {@link LighthouseRunListItemSchema}.
 */
export type LighthouseRunListItem = z.infer<typeof LighthouseRunListItemSchema>;

/**
 * Paginated response envelope for `GET /api/lighthouse/runs`.
 */
export const ListLighthouseRunsResponseSchema = z
  .object({
    runs: z.array(LighthouseRunListItemSchema),
    total: z.number().int().min(0),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().min(0),
  })
  .strict();

/**
 * Type alias for {@link ListLighthouseRunsResponseSchema}.
 */
export type ListLighthouseRunsResponse = z.infer<
  typeof ListLighthouseRunsResponseSchema
>;

/**
 * Single Audit Run detail payload returned by `GET /api/lighthouse/runs/:id` and SSE `complete` events.
 */
export const LighthouseRunDetailSchema = LighthouseRunListItemSchema.extend({
  summary: LighthouseRunSummaryDataSchema,
}).strict();

/**
 * Type alias for {@link LighthouseRunDetailSchema}.
 */
export type LighthouseRunDetail = z.infer<typeof LighthouseRunDetailSchema>;

/**
 * Query parameter schema for `GET /api/lighthouse/diff`.
 */
export const LighthouseDiffQuerySchema = z
  .object({
    baseline: z
      .string()
      .trim()
      .min(1, "Query parameter 'baseline' is required"),
    comparison: z
      .string()
      .trim()
      .min(1, "Query parameter 'comparison' is required"),
  })
  .strict();

/**
 * Type alias for {@link LighthouseDiffQuerySchema}.
 */
export type LighthouseDiffQuery = z.infer<typeof LighthouseDiffQuerySchema>;

/**
 * Minimal Insight Audit descriptor emitted in pairwise diff transitions.
 */
export const InsightDiffItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
  })
  .strict();

/**
 * Type alias for {@link InsightDiffItemSchema}.
 */
export type InsightDiffItem = z.infer<typeof InsightDiffItemSchema>;

/**
 * Status transitions comparing failing Insight Audits and CLS culprits between two runs.
 */
export const InsightDiffSummarySchema = z
  .object({
    resolved: z.array(InsightDiffItemSchema),
    regressed: z.array(InsightDiffItemSchema),
    clsCulpritDelta: z.number().int().nullable(),
  })
  .strict();

/**
 * Type alias for {@link InsightDiffSummarySchema}.
 */
export type InsightDiffSummary = z.infer<typeof InsightDiffSummarySchema>;

/**
 * Pairwise category score delta values (`comparison - baseline`).
 */
export const LighthouseScoreDeltasSchema = z
  .object({
    performanceScore: z.number().nullable(),
    accessibilityScore: z.number().nullable(),
    bestPracticesScore: z.number().nullable(),
    seoScore: z.number().nullable(),
  })
  .strict();

/**
 * Type alias for {@link LighthouseScoreDeltasSchema}.
 */
export type LighthouseScoreDeltas = z.infer<typeof LighthouseScoreDeltasSchema>;

/**
 * Pairwise Core Web Vitals delta values (`comparison - baseline`).
 */
export const LighthouseMetricDeltasSchema = z
  .object(CoreWebVitalFields)
  .strict();

/**
 * Type alias for {@link LighthouseMetricDeltasSchema}.
 */
export type LighthouseMetricDeltas = z.infer<
  typeof LighthouseMetricDeltasSchema
>;

/**
 * Combined score, metric, and insight deltas between two Audit Runs.
 */
export const LighthouseDiffDeltasSchema = z
  .object({
    scores: LighthouseScoreDeltasSchema,
    metrics: LighthouseMetricDeltasSchema,
    insights: InsightDiffSummarySchema,
  })
  .strict();

/**
 * Type alias for {@link LighthouseDiffDeltasSchema}.
 */
export type LighthouseDiffDeltas = z.infer<typeof LighthouseDiffDeltasSchema>;

/**
 * Response payload for `GET /api/lighthouse/diff`.
 */
export const LighthouseDiffResponseSchema = z
  .object({
    baseline: LighthouseRunDetailSchema,
    comparison: LighthouseRunDetailSchema,
    deltas: LighthouseDiffDeltasSchema,
  })
  .strict();

/**
 * Type alias for {@link LighthouseDiffResponseSchema}.
 */
export type LighthouseDiffResponse = z.infer<
  typeof LighthouseDiffResponseSchema
>;

/**
 * Execution lifecycle statuses for a transient daemon-managed Audit Job.
 */
export const AuditJobStatusSchema = z.enum(["running", "completed", "failed"]);

/**
 * Type alias for {@link AuditJobStatusSchema}.
 */
export type AuditJobStatus = z.infer<typeof AuditJobStatusSchema>;

/**
 * Structured error payload attached to a failed Audit Job and emitted in SSE `error` events.
 */
export const AuditJobErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  })
  .strict();

/**
 * Type alias for {@link AuditJobErrorSchema}.
 */
export type AuditJobError = z.infer<typeof AuditJobErrorSchema>;

/**
 * SSE `progress` event data schema (`event: progress`).
 */
export const AuditSseProgressEventSchema = z
  .object({
    jobId: z.string(),
    status: z.literal("running"),
    stage: LighthouseProgressStageSchema,
    message: z.string(),
    runIndex: z.number().int().min(0).optional(),
    totalRuns: z.number().int().min(1).optional(),
    timestamp: z.string().datetime(),
  })
  .strict();

/**
 * Type alias for {@link AuditSseProgressEventSchema}.
 */
export type AuditSseProgressEvent = z.infer<typeof AuditSseProgressEventSchema>;

/**
 * SSE `complete` event data schema (`event: complete`).
 */
export const AuditSseCompleteEventSchema = z
  .object({
    jobId: z.string(),
    status: z.literal("completed"),
    runId: z.string(),
    run: LighthouseRunDetailSchema,
  })
  .strict();

/**
 * Type alias for {@link AuditSseCompleteEventSchema}.
 */
export type AuditSseCompleteEvent = z.infer<typeof AuditSseCompleteEventSchema>;

/**
 * SSE `error` event data schema (`event: error`).
 */
export const AuditSseErrorEventSchema = z
  .object({
    jobId: z.string(),
    status: z.literal("failed"),
    error: AuditJobErrorSchema,
  })
  .strict();

/**
 * Type alias for {@link AuditSseErrorEventSchema}.
 */
export type AuditSseErrorEvent = z.infer<typeof AuditSseErrorEventSchema>;

/**
 * Snapshot representation of a daemon-managed Audit Job returned by trigger and active-job endpoints.
 */
export const AuditJobSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    formFactor: LighthouseFormFactorSchema,
    throttlingMethod: LighthouseThrottlingMethodSchema,
    runs: z.number().int().min(1),
    categories: z.array(LighthouseCategoryIdSchema),
    status: AuditJobStatusSchema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    latestProgress: AuditSseProgressEventSchema.nullable(),
    runId: z.string().nullable(),
    error: AuditJobErrorSchema.nullable(),
  })
  .strict();

/**
 * Type alias for {@link AuditJobSchema}.
 */
export type AuditJob = z.infer<typeof AuditJobSchema>;

/**
 * Response envelope returned with `202 Accepted` from `POST /api/lighthouse/audits`.
 */
export const TriggerLighthouseAuditResponseSchema = z
  .object({
    job: AuditJobSchema,
  })
  .strict();

/**
 * Type alias for {@link TriggerLighthouseAuditResponseSchema}.
 */
export type TriggerLighthouseAuditResponse = z.infer<
  typeof TriggerLighthouseAuditResponseSchema
>;

/**
 * Response envelope returned from `GET /api/lighthouse/audits/active` for dashboard reload recovery.
 */
export const ActiveAuditJobResponseSchema = z.discriminatedUnion("active", [
  z.object({ active: z.literal(true), job: AuditJobSchema }).strict(),
  z.object({ active: z.literal(false), job: z.null() }).strict(),
]);

/**
 * Type alias for {@link ActiveAuditJobResponseSchema}.
 */
export type ActiveAuditJobResponse = z.infer<
  typeof ActiveAuditJobResponseSchema
>;
