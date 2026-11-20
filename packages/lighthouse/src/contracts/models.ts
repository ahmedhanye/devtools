import type {
  LighthouseCategoryScores,
  LighthouseCoreWebVitals,
  LighthouseFormFactor,
  LighthouseProgressStage,
  LighthouseRunSummary,
  LighthouseThrottlingMethod,
} from "./schemas";

/**
 * Domain persistence record representing a completed Lighthouse Audit Run.
 *
 * @remarks
 * Exposes domain-owned fields typed against `@devtools/lighthouse/schemas` so
 * consuming applications (`apps/cli`, `apps/api`) remain decoupled from `@devtools/db`.
 */
export interface LighthouseRunRecord {
  id: string;
  url: string;
  finalUrl: string;
  formFactor: LighthouseFormFactor;
  throttlingMethod: LighthouseThrottlingMethod;
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  siMs: number | null;
  ttfbMs: number | null;
  /** Parsed warm summary payload, or `null` when persisted `summary_json` is missing or damaged. */
  summaryJson: LighthouseRunSummary | null;
  jsonReportPath: string;
  htmlReportPath: string;
  durationMs: number;
  createdAt: Date;
}

/**
 * Insert payload for creating a {@link LighthouseRunRecord} inside {@link LighthouseStore.insertRun}.
 */
export type NewLighthouseRunRecord = Omit<
  LighthouseRunRecord,
  "createdAt" | "summaryJson"
> & {
  summaryJson: LighthouseRunSummary;
  createdAt?: Date;
};

/**
 * Filter and pagination options for {@link LighthouseStore.listRuns} and {@link LighthouseStore.listRunsWithTotal}.
 */
export interface ListLighthouseRunsOptions {
  /** Optional exact URL filter. */
  url?: string;
  /** Optional case-insensitive URL substring filter. */
  search?: string;
  /** Optional form factor filter (`"mobile"` or `"desktop"`). */
  formFactor?: LighthouseFormFactor;
  /** Maximum number of rows to return. Defaults to `50`. */
  limit?: number;
  /** Zero-based row offset for pagination. Defaults to `0`. */
  offset?: number;
}

/**
 * Lookup options for {@link LighthouseStore.findPreviousRun}.
 */
export interface FindPreviousRunOptions {
  /** Target URL to match. */
  url: string;
  /** Form factor (`"mobile"` or `"desktop"`) to match. */
  formFactor: LighthouseFormFactor;
  /** Optional current run ID to exclude so the immediately preceding run is returned. */
  excludeId?: string;
}

/**
 * Complete normalized result extracted from a single Lighthouse v13 Result (`LHR`).
 */
export interface NormalizedLighthouseRun {
  requestedUrl: string;
  finalUrl: string;
  scores: LighthouseCategoryScores;
  metrics: LighthouseCoreWebVitals;
  summary: LighthouseRunSummary;
}

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
 * Output produced by a single isolated Lighthouse run iteration before aggregation.
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
 * Serializable intermediate output produced by `executeLighthouseBatch` before persistence.
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
 * Complete result returned by {@link LighthouseStore.runAudit} and {@link LighthouseStore.persistBatch}.
 */
export interface LighthouseAuditExecutionResult {
  /** Canonical persisted Audit Run record. */
  run: LighthouseRunRecord;
  /** Immediately preceding run for the same URL and formFactor, or `null` when none exists. */
  previousRun: LighthouseRunRecord | null;
  /** Normalized category scores, Core Web Vitals, and warm summary JSON. */
  normalized: NormalizedLighthouseRun;
  /** Zero-based index of the selected Representative Run within the `--runs <N>` batch. */
  representativeRunIndex: number;
}
