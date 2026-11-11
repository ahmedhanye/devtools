import { readFileSync } from "node:fs";
import { API_ERROR_CODES, type EnvMap } from "@devtools/core";
import { getDb, type DevtoolsDb, type LighthouseRunRow } from "@devtools/db";
import {
  AmbiguousRunIdError,
  computeRunDeltas,
  LighthouseRunNotFoundError,
  listLighthouseRunsWithTotal,
  resolveArtifactsDir,
  resolveLighthouseRun,
  resolveSafeHtmlReportPath,
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
import {
  AuditJobManager,
  type AuditJobStreamEvent,
} from "../lighthouse/job-manager";
import {
  serializeLighthouseRunDetail,
  serializeLighthouseRunListItem,
} from "../lighthouse/serializers";
import type { LighthouseAuditRunner } from "../lighthouse/worker-runner";
import { type ApiBindings, formatError } from "../middleware/security";

const DEFAULT_KEEPALIVE_INTERVAL_MS = 5000;
const REPORT_CSP_HEADER =
  "sandbox allow-scripts allow-popups allow-downloads; frame-ancestors 'self'";

/**
 * Configuration seams for instantiating the `/lighthouse` API route module.
 */
export interface LighthouseRoutesOptions {
  /** Optional injected SQLite client (defaults lazily to `getDb({ env })`). */
  db?: DevtoolsDb;
  /** Optional environment map seam passed to DB and artifacts resolution. */
  env?: EnvMap;
  /** Optional explicit artifacts root directory override. */
  artifactsDir?: string;
  /** Optional batch execution runner overriding the production Bun `Worker`. */
  auditRunner?: LighthouseAuditRunner;
  /** Retention duration (ms) for the latest completed/failed Audit Job SSE snapshot. */
  jobRetentionMs?: number;
  /** SSE `: keepalive\n\n` interval in milliseconds (defaults to `5000`). */
  keepaliveIntervalMs?: number;
}

function resolveRunOrError(
  c: Context<{ Bindings: ApiBindings }>,
  db: DevtoolsDb,
  idOrPrefix: string,
): { ok: true; row: LighthouseRunRow } | { ok: false; response: Response } {
  try {
    return { ok: true, row: resolveLighthouseRun(db, idOrPrefix) };
  } catch (err: unknown) {
    if (err instanceof LighthouseRunNotFoundError) {
      return {
        ok: false,
        response: c.json(
          formatError(API_ERROR_CODES.NOT_FOUND, err.message),
          404,
        ),
      };
    }
    if (err instanceof AmbiguousRunIdError) {
      return {
        ok: false,
        response: c.json(
          formatError(API_ERROR_CODES.CONFLICT, err.message),
          409,
        ),
      };
    }
    throw err;
  }
}

/**
 * Creates the `/lighthouse` Hono route module exposing Audit Job triggering, SSE streaming,
 * historical run inspection, isolated HTML report serving, and pairwise diffs.
 *
 * @param options - Optional dependency injection seams for hermetic testing.
 * @returns Chained Hono router preserving full RPC type inference.
 */
export function createLighthouseRoutes(options: LighthouseRoutesOptions = {}) {
  const resolveDb = (): DevtoolsDb => options.db ?? getDb({ env: options.env });
  const resolveArtifacts = (): string =>
    resolveArtifactsDir({ customDir: options.artifactsDir, env: options.env });
  const keepaliveIntervalMs =
    options.keepaliveIntervalMs ?? DEFAULT_KEEPALIVE_INTERVAL_MS;

  const jobManager = new AuditJobManager({
    resolveDb,
    resolveArtifactsDir: resolveArtifacts,
    env: options.env,
    auditRunner: options.auditRunner,
    jobRetentionMs: options.jobRetentionMs,
  });

  const withResolvedRun = (
    c: Context<{ Bindings: ApiBindings }>,
    handler: (row: LighthouseRunRow, artifactsDir: string) => Response,
  ): Response => {
    const resolved = resolveRunOrError(c, resolveDb(), c.req.param("id") ?? "");
    if (!resolved.ok) {
      return resolved.response;
    }
    return handler(resolved.row, resolveArtifacts());
  };

  return new Hono<{ Bindings: ApiBindings }>()
    .post("/audits", async (c) => {
      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        return c.json(
          formatError(API_ERROR_CODES.BAD_REQUEST, "Invalid JSON request body"),
          400,
        );
      }

      const parsed = TriggerLighthouseAuditRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        return c.json(
          formatError(
            API_ERROR_CODES.VALIDATION_ERROR,
            firstIssue?.message ?? "Invalid audit request payload",
            parsed.error.flatten(),
          ),
          422,
        );
      }

      const normalized = normalizeLighthouseAuditRequest(parsed.data);
      const outcome = jobManager.startJob(normalized);
      if (!outcome.started) {
        return c.json(
          formatError(
            API_ERROR_CODES.CONFLICT,
            "An audit job is already in progress",
            { activeJobId: outcome.activeJobId },
          ),
          409,
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
        return c.json(
          formatError(
            API_ERROR_CODES.NOT_FOUND,
            `Audit job "${jobId}" not found or expired`,
          ),
          404,
        );
      }

      c.env?.server?.timeout(c.req.raw, 0);

      return streamSSE(c, async (stream) => {
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

        if (subscription && !subscription.initialTerminal) {
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
    })
    .get("/runs", (c) => {
      const parsed = ListLighthouseRunsQuerySchema.safeParse(c.req.query());
      if (!parsed.success) {
        return c.json(
          formatError(
            API_ERROR_CODES.VALIDATION_ERROR,
            "Invalid query parameters",
            parsed.error.flatten(),
          ),
          422,
        );
      }

      const limit = parsed.data.limit ?? 50;
      const offset = parsed.data.offset ?? 0;
      const db = resolveDb();
      const artifactsDir = resolveArtifacts();
      const { runs, total } = listLighthouseRunsWithTotal(db, {
        url: parsed.data.url,
        search: parsed.data.search,
        formFactor: parsed.data.formFactor,
        limit,
        offset,
      });

      return c.json(
        ListLighthouseRunsResponseSchema.parse({
          runs: runs.map((row) =>
            serializeLighthouseRunListItem(row, artifactsDir),
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
      return withResolvedRun(c, (row, artifactsDir) => {
        const safePath = resolveSafeHtmlReportPath(
          row.htmlReportPath,
          artifactsDir,
        );
        if (!safePath) {
          return c.json(
            formatError(
              API_ERROR_CODES.NOT_FOUND,
              `HTML report artifact not found for run "${row.id}"`,
            ),
            404,
          );
        }

        const html = readFileSync(safePath, "utf-8");
        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": REPORT_CSP_HEADER,
            "Cache-Control": "private, no-store",
          },
        });
      });
    })
    .get("/diff", (c) => {
      const parsed = LighthouseDiffQuerySchema.safeParse(c.req.query());
      if (!parsed.success) {
        return c.json(
          formatError(
            API_ERROR_CODES.VALIDATION_ERROR,
            "Both 'baseline' and 'comparison' query parameters are required",
            parsed.error.flatten(),
          ),
          422,
        );
      }

      const db = resolveDb();
      const baseline = resolveRunOrError(c, db, parsed.data.baseline);
      if (!baseline.ok) {
        return baseline.response;
      }
      const comparison = resolveRunOrError(c, db, parsed.data.comparison);
      if (!comparison.ok) {
        return comparison.response;
      }

      const artifactsDir = resolveArtifacts();
      return c.json(
        LighthouseDiffResponseSchema.parse({
          baseline: serializeLighthouseRunDetail(baseline.row, artifactsDir),
          comparison: serializeLighthouseRunDetail(
            comparison.row,
            artifactsDir,
          ),
          deltas: computeRunDeltas(baseline.row, comparison.row),
        }),
        200,
      );
    });
}
