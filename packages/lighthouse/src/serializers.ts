import { API_ERROR_CODES } from "@devtools/core";
import { resolveSafeHtmlReportPath } from "./config";
import type {
  AuditJobError,
  LighthouseRunDetail,
  LighthouseRunListItem,
  LighthouseRunListRecord,
  LighthouseRunRecord,
} from "./contracts";
import { EMPTY_LIGHTHOUSE_RUN_SUMMARY } from "./domain";

function extractPublicRunFields(
  row: LighthouseRunListRecord & { summaryJson?: unknown },
) {
  const {
    htmlReportPath: _html,
    jsonReportPath: _json,
    summaryJson: _summary,
    createdAt,
    ...publicFields
  } = row;
  return { publicFields, createdAt };
}

/**
 * Projects a persisted Lighthouse run record into a sanitized {@link LighthouseRunListItem}
 * omitting heavy `summaryJson` and internal filesystem disk paths.
 *
 * @param row - Persisted SQLite run row (with or without `summaryJson`).
 * @param artifactsDir - Artifacts root directory used to check `hasHtmlReport`.
 * @param preResolvedCanonicalBase - Optional canonical artifacts directory from {@link resolveCanonicalArtifactsDir} to hoist repeated `realpathSync` calls.
 * @returns Sanitized API list item DTO.
 */
export function serializeLighthouseRunListItem(
  row: LighthouseRunListRecord,
  artifactsDir: string,
  preResolvedCanonicalBase?: string | null,
): LighthouseRunListItem {
  const { publicFields, createdAt } = extractPublicRunFields(row);
  return {
    ...publicFields,
    createdAt: new Date(createdAt).toISOString(),
    hasHtmlReport:
      resolveSafeHtmlReportPath(
        row.htmlReportPath,
        artifactsDir,
        preResolvedCanonicalBase,
      ) !== null,
  };
}

/**
 * Projects a full {@link LighthouseRunRecord} into a {@link LighthouseRunDetail} DTO
 * reusing already-parsed `summaryJson` while omitting internal filesystem paths.
 *
 * @param row - Full persisted SQLite run record.
 * @param artifactsDir - Artifacts root directory used to check `hasHtmlReport`.
 * @param preResolvedCanonicalBase - Optional canonical artifacts directory to avoid redundant `realpathSync` lookups.
 * @returns Sanitized API detail DTO.
 */
export function serializeLighthouseRunDetail(
  row: LighthouseRunRecord,
  artifactsDir: string,
  preResolvedCanonicalBase?: string | null,
): LighthouseRunDetail {
  return {
    ...serializeLighthouseRunListItem(
      row,
      artifactsDir,
      preResolvedCanonicalBase,
    ),
    summary: row.summaryJson ?? EMPTY_LIGHTHOUSE_RUN_SUMMARY,
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
    const maybeCode = "code" in err ? err.code : undefined;
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
