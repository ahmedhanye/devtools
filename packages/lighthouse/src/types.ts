import type { EnvMap } from "@devtools/core";
import type { DevtoolsDb, LighthouseRunSummaryData } from "@devtools/db";
import type {
  LighthouseCategoryScores,
  LighthouseCoreWebVitals,
  LighthouseFormFactor,
  LighthouseProgressStage,
  LighthouseThrottlingMethod,
} from "./schemas";

export {
  AttributedElementSchema,
  ClsCulpritCauseSchema,
  ClsCulpritSchema,
  DEFAULT_LIGHTHOUSE_CATEGORIES,
  ElementBoundingRectSchema,
  LcpPhaseBreakdownSchema,
  LighthouseCategoryIdSchema,
  LighthouseCategoryScoresSchema,
  LighthouseCoreWebVitalsSchema,
  LighthouseFailedAuditSchema,
  LighthouseFormFactorSchema,
  LighthouseInsightItemSchema,
  LighthouseMedianMetadataSchema,
  LighthouseProgressStageSchema,
  LighthouseRunSummaryDataSchema,
  LighthouseThrottlingMethodSchema,
  type AttributedElement,
  type ClsCulprit,
  type ClsCulpritCause,
  type ElementBoundingRect,
  type LcpPhaseBreakdown,
  type LighthouseCategoryId,
  type LighthouseCategoryScores,
  type LighthouseCoreWebVitals,
  type LighthouseFailedAudit,
  type LighthouseFormFactor,
  type LighthouseInsightItem,
  type LighthouseMedianMetadata,
  type LighthouseProgressStage,
  type LighthouseRunSummary,
  type LighthouseThrottlingMethod,
} from "./schemas";

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
