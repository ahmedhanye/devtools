import {
  type ActiveAuditJobResponse,
  ActiveAuditJobResponseSchema,
  type AuditSseCompleteEvent,
  AuditSseCompleteEventSchema,
  type AuditSseErrorEvent,
  AuditSseErrorEventSchema,
  type AuditSseProgressEvent,
  AuditSseProgressEventSchema,
  type LighthouseDiffResponse,
  LighthouseDiffResponseSchema,
  type LighthouseRunDetail,
  LighthouseRunDetailSchema,
  type ListLighthouseRunsQuery,
  type ListLighthouseRunsResponse,
  ListLighthouseRunsResponseSchema,
  type TriggerLighthouseAuditRequest,
  TriggerLighthouseAuditRequestSchema,
  type TriggerLighthouseAuditResponse,
  TriggerLighthouseAuditResponseSchema,
} from "@devtools/lighthouse/schemas";
import { fetchJson } from "@/shared/api";

const LIGHTHOUSE_API_BASE = "/api/lighthouse";

function parseJsonSafe(
  raw: string,
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

interface SseSafeParser<T> {
  safeParse: (
    value: unknown,
  ) => { success: true; data: T } | { success: false };
}

function parseSseEventPayload<T>(
  event: Event,
  schema: SseSafeParser<T>,
): T | null {
  if (!("data" in event) || typeof event.data !== "string" || !event.data) {
    return null;
  }
  const json = parseJsonSafe(event.data);
  if (!json.ok) {
    return null;
  }
  const parsed = schema.safeParse(json.value);
  return parsed.success ? parsed.data : null;
}

/**
 * Builds the query string for `GET /api/lighthouse/runs`.
 */
export function buildLighthouseRunsQueryString(
  query: ListLighthouseRunsQuery = {},
): string {
  const params = new URLSearchParams();
  if (query.url) {
    params.set("url", query.url);
  }
  if (query.search) {
    params.set("search", query.search);
  }
  if (query.formFactor) {
    params.set("formFactor", query.formFactor);
  }
  if (query.throttlingMethod) {
    params.set("throttlingMethod", query.throttlingMethod);
  }
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  if (query.offset !== undefined) {
    params.set("offset", String(query.offset));
  }
  return params.toString();
}

/**
 * Fetches paginated Audit Runs matching optional filter criteria.
 */
export function listLighthouseRuns(
  query: ListLighthouseRunsQuery = {},
  signal?: AbortSignal,
): Promise<ListLighthouseRunsResponse> {
  const qs = buildLighthouseRunsQueryString(query);
  const path = qs
    ? `${LIGHTHOUSE_API_BASE}/runs?${qs}`
    : `${LIGHTHOUSE_API_BASE}/runs`;
  return fetchJson(path, {
    schema: ListLighthouseRunsResponseSchema,
    signal,
  });
}

/**
 * Fetches full detail and summary payload for a single Audit Run.
 */
export function getLighthouseRun(
  runId: string,
  signal?: AbortSignal,
): Promise<LighthouseRunDetail> {
  return fetchJson(`${LIGHTHOUSE_API_BASE}/runs/${encodeURIComponent(runId)}`, {
    schema: LighthouseRunDetailSchema,
    signal,
  });
}

/**
 * Fetches pairwise metric and Insight Audit diff between baseline and comparison runs.
 */
export function getLighthouseDiff(
  baselineId: string,
  comparisonId: string,
  signal?: AbortSignal,
): Promise<LighthouseDiffResponse> {
  const params = new URLSearchParams({
    baseline: baselineId,
    comparison: comparisonId,
  });
  return fetchJson(`${LIGHTHOUSE_API_BASE}/diff?${params.toString()}`, {
    schema: LighthouseDiffResponseSchema,
    signal,
  });
}

/**
 * Fetches the currently active Audit Job state for reload recovery and single-flight indicators.
 */
export function getActiveAuditJob(
  signal?: AbortSignal,
): Promise<ActiveAuditJobResponse> {
  return fetchJson(`${LIGHTHOUSE_API_BASE}/audits/active`, {
    schema: ActiveAuditJobResponseSchema,
    signal,
  });
}

/**
 * Validates and submits a new Lighthouse Audit Job (`POST /api/lighthouse/audits`).
 */
export function triggerLighthouseAudit(
  request: TriggerLighthouseAuditRequest,
): Promise<TriggerLighthouseAuditResponse> {
  const validated = TriggerLighthouseAuditRequestSchema.parse(request);
  return fetchJson(`${LIGHTHOUSE_API_BASE}/audits`, {
    method: "POST",
    body: validated,
    schema: TriggerLighthouseAuditResponseSchema,
  });
}

/**
 * Returns the relative API URL serving the sandboxed HTML Report Artifact for a run.
 */
export function getLighthouseReportUrl(runId: string): string {
  return `${LIGHTHOUSE_API_BASE}/runs/${encodeURIComponent(runId)}/report`;
}

/**
 * Subscribes to live SSE progress, completion, and error events for a running Audit Job.
 *
 * @returns Cleanup function closing the `EventSource` subscription.
 */
export function subscribeToAuditJob(
  jobId: string,
  handlers: {
    onProgress?: (event: AuditSseProgressEvent) => void;
    onComplete?: (event: AuditSseCompleteEvent) => void;
    onError?: (event: AuditSseErrorEvent) => void;
    onConnectionError?: () => void;
  },
): () => void {
  if (typeof EventSource === "undefined") {
    return () => {};
  }

  const source = new EventSource(
    `${LIGHTHOUSE_API_BASE}/audits/${encodeURIComponent(jobId)}/stream`,
  );
  let closed = false;

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    source.removeEventListener("progress", handleProgress);
    source.removeEventListener("complete", handleComplete);
    source.removeEventListener("error", handleError);
    source.close();
  };

  function handleProgress(event: Event) {
    const parsed = parseSseEventPayload(event, AuditSseProgressEventSchema);
    if (parsed) {
      handlers.onProgress?.(parsed);
    }
  }

  function handleComplete(event: Event) {
    if (!("data" in event) || typeof event.data !== "string") {
      return;
    }
    const parsed = parseSseEventPayload(event, AuditSseCompleteEventSchema);
    close();
    if (parsed) {
      handlers.onComplete?.(parsed);
      return;
    }
    handlers.onConnectionError?.();
  }

  function handleError(event: Event) {
    const parsed = parseSseEventPayload(event, AuditSseErrorEventSchema);
    close();
    if (parsed) {
      handlers.onError?.(parsed);
      return;
    }
    handlers.onConnectionError?.();
  }

  source.addEventListener("progress", handleProgress);
  source.addEventListener("complete", handleComplete);
  source.addEventListener("error", handleError);

  return close;
}
