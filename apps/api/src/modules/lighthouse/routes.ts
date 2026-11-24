import { API_ERROR_CODES, type EnvMap } from "@devtools/core";
import {
  AmbiguousRunIdError,
  createAuditJobManager,
  LighthouseRunNotFoundError,
  resolveCanonicalArtifactsDir,
  serializeLighthouseRunDetail,
  serializeLighthouseRunListItem,
  type AuditJobStreamEvent,
  type LighthouseAuditRunner,
  type LighthouseRunRecord,
  type LighthouseStore,
} from "@devtools/lighthouse";
import {
  ActiveAuditJobResponseSchema,
  LighthouseDiffQuerySchema,
  LighthouseDiffResponseSchema,
  LighthouseRunDetailSchema,
  ListLighthouseRunsQuerySchema,
  ListLighthouseRunsResponseSchema,
  normalizeLighthouseAuditRequest,
  TriggerLighthouseAuditRequestSchema,
  TriggerLighthouseAuditResponseSchema,
} from "@devtools/lighthouse/schemas";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { jsonApiError } from "../../shared/http";
import type { ApiBindings } from "../../shared/security";
import { createHtmlReportResponse } from "./report-reader";

const DEFAULT_KEEPALIVE_INTERVAL_MS = 5000;

/**
 * Configuration seams for instantiating the `/lighthouse` API route module.
 */
export interface LighthouseRoutesOptions {
  /** Borrowed domain {@link LighthouseStore} owned by the composition root. */
  store: LighthouseStore;
  /** Optional host cancellation signal linking teardown into audit jobs and 503 guards. */
  signal?: AbortSignal;
  /** Optional environment map seam forwarded to audit execution. */
  env?: EnvMap;
  /** Optional batch execution runner overriding `executeLighthouseBatch`. */
  auditRunner?: LighthouseAuditRunner;
  /** Retention duration (ms) for the latest completed/failed Audit Job SSE snapshot. */
  jobRetentionMs?: number;
  /** SSE `: keepalive\n\n` interval in milliseconds (defaults to `5000`). */
  keepaliveIntervalMs?: number;
}

function resolveStoreRead<T>(
  c: Context<{ Bindings: ApiBindings }>,
  read: () => T,
): { ok: true; value: T } | { ok: false; response: Response } {
  try {
    return { ok: true, value: read() };
  } catch (err: unknown) {
    if (err instanceof LighthouseRunNotFoundError) {
      return {
        ok: false,
        response: jsonApiError(c, 404, API_ERROR_CODES.NOT_FOUND, err.message),
      };
    }
    if (err instanceof AmbiguousRunIdError) {
      return {
        ok: false,
        response: jsonApiError(c, 409, API_ERROR_CODES.CONFLICT, err.message),
      };
    }
    throw err;
  }
}

function parseQueryParams<T>(
  c: Context<{ Bindings: ApiBindings }>,
  schema: {
    safeParse: (
      input: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { flatten: () => unknown } };
  },
  message: string,
): { ok: true; data: T } | { ok: false; response: Response } {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonApiError(
        c,
        422,
        API_ERROR_CODES.VALIDATION_ERROR,
        message,
        parsed.error.flatten(),
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Creates the `/lighthouse` Hono route module exposing Audit Job triggering, SSE streaming,
 * historical run inspection, isolated HTML report serving, and pairwise diffs.
 *
 * @param options - Required borrowed {@link LighthouseStore} and optional test/signal seams.
 * @returns Chained Hono router preserving full RPC type inference.
 */
export function createLighthouseRoutes(options: LighthouseRoutesOptions) {
  const { store } = options;
  const keepaliveIntervalMs =
    options.keepaliveIntervalMs ?? DEFAULT_KEEPALIVE_INTERVAL_MS;

  const jobManager = createAuditJobManager({
    store,
    env: options.env,
    auditRunner: options.auditRunner,
    jobRetentionMs: options.jobRetentionMs,
    signal: options.signal,
  });

  const rejectIfShuttingDown = (
    c: Context<{ Bindings: ApiBindings }>,
  ): Response | null =>
    options.signal?.aborted || jobManager.isShuttingDown
      ? jsonApiError(
          c,
          503,
          API_ERROR_CODES.SERVICE_UNAVAILABLE,
          "Server is shutting down",
        )
      : null;

  const withResolvedRun = (
    c: Context<{ Bindings: ApiBindings }>,
    handler: (row: LighthouseRunRecord, artifactsDir: string) => Response,
  ): Response => {
    const id = c.req.param("id") ?? "";
    const resolved = resolveStoreRead(c, () => store.getRun(id));
    if (!resolved.ok) {
      return resolved.response;
    }
    return handler(resolved.value, store.resolveArtifactsDir());
  };

  const router = new Hono<{ Bindings: ApiBindings }>()
    .post("/audits", async (c) => {
      const earlyShutdown = rejectIfShuttingDown(c);
      if (earlyShutdown) {
        return earlyShutdown;
      }
      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        return jsonApiError(
          c,
          400,
          API_ERROR_CODES.BAD_REQUEST,
          "Invalid JSON request body",
        );
      }

      const parsed = TriggerLighthouseAuditRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        return jsonApiError(
          c,
          422,
          API_ERROR_CODES.VALIDATION_ERROR,
          firstIssue?.message ?? "Invalid audit request payload",
          parsed.error.flatten(),
        );
      }

      const midBodyShutdown = rejectIfShuttingDown(c);
      if (midBodyShutdown) {
        return midBodyShutdown;
      }

      const normalized = normalizeLighthouseAuditRequest(parsed.data);
      const outcome = jobManager.startJob(normalized);
      if (!outcome.started) {
        return jsonApiError(
          c,
          409,
          API_ERROR_CODES.CONFLICT,
          "An audit job is already in progress",
          { activeJobId: outcome.activeJobId },
        );
      }

      return c.json(
        TriggerLighthouseAuditResponseSchema.parse({ job: outcome.job }),
        202,
      );
    })
    .get("/audits/active", (c) => {
      const activeJob = jobManager.getActiveJob();
      const payload = activeJob
        ? { active: true as const, job: activeJob }
        : { active: false as const, job: null };
      return c.json(ActiveAuditJobResponseSchema.parse(payload), 200);
    })
    .get("/audits/:jobId/stream", (c) => {
      const jobId = c.req.param("jobId");
      if (!jobManager.hasJob(jobId)) {
        return jsonApiError(
          c,
          404,
          API_ERROR_CODES.NOT_FOUND,
          `Audit job "${jobId}" not found or expired`,
        );
      }

      c.env?.server?.timeout(c.req.raw, 0);

      const response = streamSSE(c, async (stream) => {
        let finished = false;
        let keepaliveTimer: ReturnType<typeof setInterval> | undefined;
        let unsubscribe: (() => void) | undefined;
        let resolveDone: (() => void) | undefined;

        const donePromise = new Promise<void>((resolve) => {
          resolveDone = resolve;
        });

        const cleanup = () => {
          if (finished) return;
          finished = true;
          if (keepaliveTimer !== undefined) {
            clearInterval(keepaliveTimer);
            keepaliveTimer = undefined;
          }
          unsubscribe?.();
          unsubscribe = undefined;
          resolveDone?.();
        };

        stream.onAbort(() => {
          cleanup();
        });

        let writeQueue = Promise.resolve();
        const enqueueWrite = (fn: () => Promise<unknown>) => {
          writeQueue = writeQueue.then(async () => {
            if (!finished && !stream.closed && !stream.aborted) {
              await fn();
            }
            return undefined;
          });
          return writeQueue;
        };

        const subscription = jobManager.subscribe(
          jobId,
          (event: AuditJobStreamEvent) => {
            if (event.type === "progress") {
              void enqueueWrite(() =>
                stream.writeSSE({
                  event: "progress",
                  data: JSON.stringify(event.data),
                }),
              );
              return;
            }
            const eventName = event.type === "complete" ? "complete" : "error";
            void enqueueWrite(() =>
              stream.writeSSE({
                event: eventName,
                data: JSON.stringify(event.data),
              }),
            ).finally(() => {
              cleanup();
            });
          },
        );

        if (!subscription) {
          cleanup();
        } else if (!subscription.initialTerminal) {
          unsubscribe = subscription.unsubscribe;
          keepaliveTimer = setInterval(() => {
            void enqueueWrite(() => stream.write(": keepalive\n\n"));
          }, keepaliveIntervalMs);
          keepaliveTimer.unref?.();
        }

        try {
          await donePromise;
          await writeQueue;
        } finally {
          cleanup();
        }
      });

      response.headers.set("Cache-Control", "no-cache, no-transform");
      response.headers.set("X-Accel-Buffering", "no");
      return response;
    })
    .get("/runs", (c) => {
      const parsed = parseQueryParams(
        c,
        ListLighthouseRunsQuerySchema,
        "Invalid query parameters",
      );
      if (!parsed.ok) {
        return parsed.response;
      }

      const limit = parsed.data.limit ?? 50;
      const offset = parsed.data.offset ?? 0;
      const artifactsDir = store.resolveArtifactsDir();
      const canonicalArtifactsDir = resolveCanonicalArtifactsDir(artifactsDir);
      const { runs, total } = store.listRunsWithTotal({
        url: parsed.data.url,
        search: parsed.data.search,
        formFactor: parsed.data.formFactor,
        throttlingMethod: parsed.data.throttlingMethod,
        limit,
        offset,
      });

      return c.json(
        ListLighthouseRunsResponseSchema.parse({
          runs: runs.map((row) =>
            serializeLighthouseRunListItem(
              row,
              artifactsDir,
              canonicalArtifactsDir,
            ),
          ),
          total,
          limit,
          offset,
        }),
        200,
      );
    })
    .get("/runs/:id", (c) => {
      return withResolvedRun(c, (row, artifactsDir) =>
        c.json(
          LighthouseRunDetailSchema.parse(
            serializeLighthouseRunDetail(row, artifactsDir),
          ),
          200,
        ),
      );
    })
    .get("/runs/:id/report", (c) => {
      const id = c.req.param("id") ?? "";
      const resolved = resolveStoreRead(c, () =>
        store.resolveReportHtmlPath(id),
      );
      if (!resolved.ok) {
        return resolved.response;
      }

      const { run, safePath } = resolved.value;
      if (!safePath) {
        return jsonApiError(
          c,
          404,
          API_ERROR_CODES.NOT_FOUND,
          `HTML report artifact not found for run "${run.id}"`,
        );
      }

      return createHtmlReportResponse(safePath);
    })
    .get("/diff", (c) => {
      const parsed = parseQueryParams(
        c,
        LighthouseDiffQuerySchema,
        "Both 'baseline' and 'comparison' query parameters are required",
      );
      if (!parsed.ok) {
        return parsed.response;
      }

      const diffResult = resolveStoreRead(c, () =>
        store.diffRuns(parsed.data.baseline, parsed.data.comparison),
      );
      if (!diffResult.ok) {
        return diffResult.response;
      }

      const artifactsDir = store.resolveArtifactsDir();
      const canonicalArtifactsDir = resolveCanonicalArtifactsDir(artifactsDir);
      return c.json(
        LighthouseDiffResponseSchema.parse({
          baseline: serializeLighthouseRunDetail(
            diffResult.value.baseline,
            artifactsDir,
            canonicalArtifactsDir,
          ),
          comparison: serializeLighthouseRunDetail(
            diffResult.value.comparison,
            artifactsDir,
            canonicalArtifactsDir,
          ),
          deltas: diffResult.value.deltas,
        }),
        200,
      );
    });

  return Object.assign(router, {
    shutdown: () => jobManager.shutdown(),
  });
}
