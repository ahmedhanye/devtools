/**
 * Isolated Lighthouse v13 audit engine, metric extraction, multi-run representative selection,
 * and 3-tier persistence services for DevTools.
 *
 * @packageDocumentation
 */
export type {
  AuditJobManager,
  AuditJobManagerOptions,
  AuditJobStreamEvent,
  BrowserResolverPort,
  ExecuteIterationParams,
  ExecuteLighthouseBatchOptions,
  LighthouseAuditRunner,
  LighthouseIterationExecutor,
  LighthouseStore,
  RunLighthouseAuditOptions,
} from "./application";
export {
  resolveArtifactsTargetDir,
  resolveCanonicalArtifactsDir,
  resolveSafeHtmlReportPath,
} from "./config";
export {
  AmbiguousRunIdError,
  AuditCancelledError,
  EmptyRunsError,
  InvalidAuditOptionsError,
  LighthouseRunNotFoundError,
  WorkerExecutionError,
  type AttributedElement,
  type AuditJob,
  type AuditJobError,
  type AuditSseCompleteEvent,
  type AuditSseErrorEvent,
  type AuditSseProgressEvent,
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
  type LighthouseRunDetail,
  type LighthouseRunListItem,
  type LighthouseRunListRecord,
  type LighthouseRunRecord,
  type LighthouseRunSummary,
  type LighthouseThrottlingMethod,
  type ListLighthouseRunsOptions,
  type NewLighthouseRunRecord,
  type NormalizedLighthouseAuditRequest,
  type NormalizedLighthouseRun,
  type RawLhrAuditItem,
  type RawLighthouseResult,
  type SingleIterationResult,
} from "./contracts";
export { EMPTY_LIGHTHOUSE_RUN_SUMMARY, parseRunSummary } from "./domain";
export {
  serializeAuditError,
  serializeLighthouseRunDetail,
  serializeLighthouseRunListItem,
} from "./serializers";
export type { LighthouseStoreOptions } from "./infra/persistence/store-factory";
export {
  createAuditJobManager,
  createLighthouseStore,
  executeLighthouseBatch,
} from "./wiring";
