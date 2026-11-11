import { randomUUID } from "node:crypto";
import type { EnvMap } from "@devtools/core";
import type { DevtoolsDb } from "@devtools/db";
import { persistLighthouseAudit } from "@devtools/lighthouse";
import type {
  AuditJob,
  AuditSseCompleteEvent,
  AuditSseErrorEvent,
  AuditSseProgressEvent,
  NormalizedLighthouseAuditRequest,
} from "@devtools/lighthouse/schemas";
import { serializeLighthouseRunDetail } from "./serializers";
import { serializeAuditError } from "./worker-handler";
import { runAuditInWorker, type LighthouseAuditRunner } from "./worker-runner";

const DEFAULT_JOB_RETENTION_MS = 5 * 60 * 1000;

/**
 * Discriminated SSE payload emitted by {@link AuditJobManager} subscribers.
 */
export type AuditJobStreamEvent =
  | { type: "progress"; data: AuditSseProgressEvent }
  | { type: "complete"; data: AuditSseCompleteEvent }
  | { type: "error"; data: AuditSseErrorEvent };

interface InternalAuditJob {
  snapshot: AuditJob;
  subscribers: Set<(event: AuditJobStreamEvent) => void>;
  terminalEvent:
    | { type: "complete"; data: AuditSseCompleteEvent }
    | { type: "error"; data: AuditSseErrorEvent }
    | null;
}

/**
 * Configuration seams for {@link AuditJobManager}.
 */
export interface AuditJobManagerOptions {
  /** Lazy SQLite DB getter executed on the parent thread upon completion. */
  resolveDb: () => DevtoolsDb;
  /** Lazy artifacts directory resolver executed on the parent thread. */
  resolveArtifactsDir: () => string;
  /** Optional environment map forwarded to worker execution and persistence. */
  env?: EnvMap;
  /** Injectable batch execution runner (defaults to Bun Worker execution). */
  auditRunner?: LighthouseAuditRunner;
  /** Duration in milliseconds to retain the latest terminal job snapshot for SSE replay. */
  jobRetentionMs?: number;
}

function cloneAuditJob(job: AuditJob): AuditJob {
  return {
    ...job,
    categories: [...job.categories],
    latestProgress: job.latestProgress ? { ...job.latestProgress } : null,
    error: job.error ? { ...job.error } : null,
  };
}

/**
 * Coordinates single-flight Lighthouse Audit Jobs, SSE progress replay, terminal snapshot
 * retention, and parent-thread SQLite persistence.
 */
export class AuditJobManager {
  private readonly resolveDb: () => DevtoolsDb;
  private readonly resolveArtifactsDir: () => string;
  private readonly env?: EnvMap;
  private readonly auditRunner: LighthouseAuditRunner;
  private readonly jobRetentionMs: number;

  private activeJob: InternalAuditJob | null = null;
  private retainedJob: InternalAuditJob | null = null;
  private retentionTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Creates an {@link AuditJobManager}.
   *
   * @param options - Lazy persistence resolvers, runner seam, and retention configuration.
   */
  constructor(options: AuditJobManagerOptions) {
    this.resolveDb = options.resolveDb;
    this.resolveArtifactsDir = options.resolveArtifactsDir;
    this.env = options.env;
    this.auditRunner = options.auditRunner ?? runAuditInWorker;
    this.jobRetentionMs = options.jobRetentionMs ?? DEFAULT_JOB_RETENTION_MS;
  }

  /**
   * Starts a new Audit Job unless another Audit Job is currently running.
   *
   * @param request - Validated and normalized audit execution parameters.
   * @returns Started job descriptor or single-flight conflict metadata containing `activeJobId`.
   */
  startJob(
    request: NormalizedLighthouseAuditRequest,
  ):
    { started: true; job: AuditJob } | { started: false; activeJobId: string } {
    if (this.activeJob && this.activeJob.snapshot.status === "running") {
      return {
        started: false,
        activeJobId: this.activeJob.snapshot.id,
      };
    }

    this.clearRetainedJob();

    const jobId = randomUUID();
    const internalJob: InternalAuditJob = {
      snapshot: {
        id: jobId,
        url: request.url,
        formFactor: request.formFactor,
        throttlingMethod: request.throttlingMethod,
        runs: request.runs,
        categories: [...request.categories],
        status: "running",
        startedAt: new Date().toISOString(),
        completedAt: null,
        latestProgress: null,
        runId: null,
        error: null,
      },
      subscribers: new Set(),
      terminalEvent: null,
    };

    this.activeJob = internalJob;
    void this.executeJob(internalJob, request);

    return {
      started: true,
      job: cloneAuditJob(internalJob.snapshot),
    };
  }

  /**
   * Returns a snapshot of the currently running Audit Job, or `null` when idle.
   *
   * @returns Active {@link AuditJob} snapshot or `null`.
   */
  getActiveJob(): AuditJob | null {
    if (this.activeJob && this.activeJob.snapshot.status === "running") {
      return cloneAuditJob(this.activeJob.snapshot);
    }
    return null;
  }

  /**
   * Checks whether `jobId` corresponds to the active or retained terminal Audit Job.
   *
   * @param jobId - Target Audit Job identifier.
   * @returns `true` if the job exists and has not expired.
   */
  hasJob(jobId: string): boolean {
    return this.findJob(jobId) !== null;
  }

  /**
   * Subscribes to SSE progress and terminal events for an active or retained Audit Job,
   * immediately replaying the latest snapshot when available.
   *
   * @param jobId - Target Audit Job identifier.
   * @param listener - Callback receiving replayed and live {@link AuditJobStreamEvent} frames.
   * @returns Subscription handle with `initialTerminal` flag and `unsubscribe` cleanup, or `null` if unknown.
   */
  subscribe(
    jobId: string,
    listener: (event: AuditJobStreamEvent) => void,
  ): { initialTerminal: boolean; unsubscribe: () => void } | null {
    const job = this.findJob(jobId);
    if (!job) {
      return null;
    }

    if (job.terminalEvent) {
      listener(job.terminalEvent);
      return {
        initialTerminal: true,
        unsubscribe: () => {},
      };
    }

    job.subscribers.add(listener);
    if (job.snapshot.latestProgress) {
      listener({ type: "progress", data: job.snapshot.latestProgress });
    }

    return {
      initialTerminal: false,
      unsubscribe: () => {
        job.subscribers.delete(listener);
      },
    };
  }

  private findJob(jobId: string): InternalAuditJob | null {
    if (this.activeJob?.snapshot.id === jobId) {
      return this.activeJob;
    }
    if (this.retainedJob?.snapshot.id === jobId) {
      return this.retainedJob;
    }
    return null;
  }

  private clearRetainedJob(): void {
    this.retainedJob = null;
    if (this.retentionTimer !== null) {
      clearTimeout(this.retentionTimer);
      this.retentionTimer = null;
    }
  }

  private finalizeJob(
    job: InternalAuditJob,
    terminalEvent: NonNullable<InternalAuditJob["terminalEvent"]>,
  ): void {
    job.terminalEvent = terminalEvent;
    this.activeJob = null;
    this.retainedJob = job;

    this.retentionTimer = setTimeout(() => {
      if (this.retainedJob?.snapshot.id === job.snapshot.id) {
        this.retainedJob = null;
      }
      this.retentionTimer = null;
    }, this.jobRetentionMs);
    this.retentionTimer.unref?.();

    for (const subscriber of job.subscribers) {
      subscriber(terminalEvent);
    }
    job.subscribers.clear();
  }

  private async executeJob(
    job: InternalAuditJob,
    request: NormalizedLighthouseAuditRequest,
  ): Promise<void> {
    const jobId = job.snapshot.id;
    try {
      const batch = await this.auditRunner({
        url: request.url,
        formFactor: request.formFactor,
        throttlingMethod: request.throttlingMethod,
        runs: request.runs,
        categories: request.categories,
        env: this.env,
        onProgress: (event) => {
          if (event.stage === "complete") {
            return;
          }
          const progressEvent: AuditSseProgressEvent = {
            jobId,
            status: "running",
            stage: event.stage,
            message: event.message,
            ...(event.runIndex !== undefined
              ? { runIndex: event.runIndex }
              : {}),
            ...(event.totalRuns !== undefined
              ? { totalRuns: event.totalRuns }
              : {}),
            timestamp: new Date().toISOString(),
          };
          job.snapshot.latestProgress = progressEvent;
          for (const subscriber of job.subscribers) {
            subscriber({ type: "progress", data: progressEvent });
          }
        },
      });

      let persisted: ReturnType<typeof persistLighthouseAudit>;
      let serializedRun: ReturnType<typeof serializeLighthouseRunDetail>;
      try {
        const db = this.resolveDb();
        const artifactsDir = this.resolveArtifactsDir();
        persisted = persistLighthouseAudit(batch, {
          db,
          artifactsDir,
          env: this.env,
        });
        serializedRun = serializeLighthouseRunDetail(
          persisted.run,
          artifactsDir,
        );
      } catch (persistErr: unknown) {
        throw new Error("Failed to persist completed audit results", {
          cause: persistErr,
        });
      }

      job.snapshot.status = "completed";
      job.snapshot.completedAt = new Date().toISOString();
      job.snapshot.runId = persisted.run.id;

      this.finalizeJob(job, {
        type: "complete",
        data: {
          jobId,
          status: "completed",
          runId: persisted.run.id,
          run: serializedRun,
        },
      });
    } catch (err: unknown) {
      const jobError = serializeAuditError(err);
      job.snapshot.status = "failed";
      job.snapshot.completedAt = new Date().toISOString();
      job.snapshot.error = jobError;

      this.finalizeJob(job, {
        type: "error",
        data: {
          jobId,
          status: "failed",
          error: jobError,
        },
      });
    }
  }
}
