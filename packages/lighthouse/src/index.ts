/**
 * Isolated Lighthouse v13 audit engine, metric extraction, multi-run representative selection,
 * and 3-tier persistence services for DevTools.
 *
 * @packageDocumentation
 */
export type {
  BrowserResolverPort,
  ExecuteIterationParams,
  ExecuteLighthouseBatchOptions,
  LighthouseIterationExecutor,
  LighthouseStore,
  RunLighthouseAuditOptions,
} from "./application";
export { resolveSafeHtmlReportPath } from "./config";
export {
  AmbiguousRunIdError,
  AuditCancelledError,
  EmptyRunsError,
  InvalidAuditOptionsError,
  LighthouseRunNotFoundError,
  WorkerExecutionError,
  type AttributedElement,
  type ClsCulprit,
  type ClsCulpritCause,
  type ElementBoundingRect,
  type FindPreviousRunOptions,
  type InsightDiffSummary,
  type LcpPhaseBreakdown,
  type LighthouseAuditExecutionResult,
  type LighthouseBatchExecutionResult,
  type LighthouseCategoryId,
  type LighthouseCategoryScores,
  type LighthouseCoreWebVitals,
  type LighthouseDiffDeltas,
  type LighthouseFailedAudit,
  type LighthouseFormFactor,
  type LighthouseInsightItem,
  type LighthouseMedianMetadata,
  type LighthouseProgressEvent,
  type LighthouseProgressStage,
  type LighthouseRunRecord,
  type LighthouseRunSummary,
  type LighthouseThrottlingMethod,
  type ListLighthouseRunsOptions,
  type NewLighthouseRunRecord,
  type NormalizedLighthouseRun,
  type RawLhrAuditItem,
  type RawLighthouseResult,
  type SingleIterationResult,
} from "./contracts";
export { EMPTY_LIGHTHOUSE_RUN_SUMMARY, parseRunSummary } from "./domain";
export type { LighthouseStoreOptions } from "./infra/persistence/store-factory";
export { executeLighthouseBatch, openLighthouseStore } from "./wiring";
