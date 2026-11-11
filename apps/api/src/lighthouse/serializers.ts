import { API_ERROR_CODES } from "@devtools/core";
import type { LighthouseRunRow } from "@devtools/db";
import {
  parseRunSummary,
  resolveSafeHtmlReportPath,
} from "@devtools/lighthouse";
import type {
  AuditJobError,
  LighthouseRunDetail,
  LighthouseRunListItem,
  LighthouseRunSummary,
} from "@devtools/lighthouse/schemas";

const EMPTY_SUMMARY: LighthouseRunSummary = {
  lcpElement: null,
  lcpPhases: null,
  clsCulprits: [],
  insights: [],
  failedAudits: [],
  runWarnings: [],
  runtimeError: null,
  medianMetadata: null,
};

/**
 * Projects a database {@link LighthouseRunRow} into a sanitized {@link LighthouseRunListItem}
 * omitting heavy `summaryJson` and internal filesystem disk paths.
 *
 * @param row - Persisted SQLite row.
 * @param artifactsDir - Artifacts root directory used to check `hasHtmlReport`.
 * @returns Sanitized API list item DTO.
 */
export function serializeLighthouseRunListItem(
  row: LighthouseRunRow,
  artifactsDir: string,
): LighthouseRunListItem {
  return {
    id: row.id,
    url: row.url,
    finalUrl: row.finalUrl,
    formFactor: row.formFactor,
    throttlingMethod: row.throttlingMethod,
    performanceScore: row.performanceScore,
    accessibilityScore: row.accessibilityScore,
    bestPracticesScore: row.bestPracticesScore,
    seoScore: row.seoScore,
    lcpMs: row.lcpMs,
    cls: row.cls,
    tbtMs: row.tbtMs,
    fcpMs: row.fcpMs,
    siMs: row.siMs,
    ttfbMs: row.ttfbMs,
    durationMs: row.durationMs,
    createdAt: new Date(row.createdAt).toISOString(),
    hasHtmlReport:
      resolveSafeHtmlReportPath(row.htmlReportPath, artifactsDir) !== null,
  };
}

/**
 * Projects a database {@link LighthouseRunRow} into a {@link LighthouseRunDetail} DTO
 * including parsed `summary` while omitting internal filesystem paths.
 *
 * @param row - Persisted SQLite row.
 * @param artifactsDir - Artifacts root directory used to check `hasHtmlReport`.
 * @returns Sanitized API detail DTO.
 */
export function serializeLighthouseRunDetail(
  row: LighthouseRunRow,
  artifactsDir: string,
): LighthouseRunDetail {
  return {
    ...serializeLighthouseRunListItem(row, artifactsDir),
    summary: parseRunSummary(row.summaryJson) ?? EMPTY_SUMMARY,
  };
}

/**
 * Converts an arbitrary thrown error into a structured {@link AuditJobError} envelope
 * preserving domain error codes (`BROWSER_NOT_FOUND`, `AUDIT_CANCELLED`, etc.).
 *
 * @param err - Caught error value.
 * @returns Structured error payload suitable for SSE `error` frames and job snapshots.
 */
export function serializeAuditError(err: unknown): AuditJobError {
  if (err instanceof Error) {
    const maybeCode = (err as { code?: unknown }).code;
    const code =
      typeof maybeCode === "string" && maybeCode.length > 0
        ? maybeCode
        : API_ERROR_CODES.INTERNAL_ERROR;
    return {
      code,
      message: err.message || "Lighthouse audit execution failed",
    };
  }
  return {
    code: API_ERROR_CODES.INTERNAL_ERROR,
    message:
      typeof err === "string" && err.length > 0
        ? err
        : "Lighthouse audit execution failed",
  };
}
