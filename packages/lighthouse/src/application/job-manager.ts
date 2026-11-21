import { randomUUID } from "node:crypto";
import type { EnvMap } from "@devtools/core";
import {
  AuditCancelledError,
  type AuditJob,
  type AuditJobError,
  type AuditSseCompleteEvent,
  type AuditSseErrorEvent,
  type AuditSseProgressEvent,
  type LighthouseAuditExecutionResult,
  type LighthouseBatchExecutionResult,
  type LighthouseRunDetail,
  type LighthouseRunRecord,
  type NormalizedLighthouseAuditRequest,
} from "../contracts";
import type { ExecuteLighthouseBatchOptions, LighthouseStore } from "./ports";

const DEFAULT_JOB_RETENTION_MS = 5 * 60 * 1000;

/**
 * Function signature for executing a Lighthouse batch either directly via
 * `executeLighthouseBatch` or an injected fast test seam on `CreateAppOptions.auditRunner`.
 */
export type LighthouseAuditRunner = (
  params: ExecuteLighthouseBatchOptions,
) => Promise<LighthouseBatchExecutionResult>;

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
 * Configuration seams for `createAuditJobManager`.
 */
export interface AuditJobManagerOptions {
  /** Unified Lighthouse domain store executed on the parent thread upon completion. */
  store: LighthouseStore;
  /** Optional environment map forwarded to execution. */
  env?: EnvMap;
  /** Injectable batch execution runner (defaults to `executeLighthouseBatch`). */
  auditRunner?: LighthouseAuditRunner;
  /** Duration in milliseconds to retain the latest terminal job snapshot for SSE replay. */
  jobRetentionMs?: number;
  /** Optional host cancellation signal linking teardown into running and new jobs. */
  signal?: AbortSignal;
}

/**
 * Infrastructure serializer and default-runner ports injected by `wiring.ts`.
 */
export interface AuditJobManagerPorts {
  /** Default batch execution runner used when `options.auditRunner` is omitted. */
  defaultAuditRunner: LighthouseAuditRunner;
  /** Maps a persisted run row to the public detail DTO. */
  serializeRunDetail: (
    row: LighthouseRunRecord,
    artifactsDir: string,
  ) => LighthouseRunDetail;
  /** Maps arbitrary runtime errors to a structured job error envelope. */
  serializeError: (err: unknown) => AuditJobError;
}

/**
 * Public single-flight Audit Job orchestration contract.
 */
export interface AuditJobManager {
  /** Whether shutdown or host signal abort has started and new jobs must be rejected. */
  readonly isShuttingDown: boolean;
  /** Starts a new Audit Job unless shutting down or another Audit Job is active. */
  startJob(
    request: NormalizedLighthouseAuditRequest,
  ): { started: true; job: AuditJob } | { started: false; activeJobId: string };
  /** Returns a snapshot of the currently running Audit Job, or `null` when idle. */
  getActiveJob(): AuditJob | null;
  /** Checks whether `jobId` corresponds to the active or retained terminal Audit Job. */
  hasJob(jobId: string): boolean;
  /** Subscribes to SSE progress and terminal events for an active or retained Audit Job. */
  subscribe(
    jobId: string,
    listener: (event: AuditJobStreamEvent) => void,
  ): { initialTerminal: boolean; unsubscribe: () => void } | null;
  /** Cancels any running Lighthouse audit job, clears retained job timers, and waits for completion. */
  shutdown(): Promise<void>;
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
 * Creates a port-injected {@link AuditJobManager} instance without direct dependency on infrastructure modules.
 *
 * @param options - Caller configuration seams and optional host `AbortSignal`.
 * @param ports - Infrastructure serializer and default-runner ports.
 * @returns Stateful {@link AuditJobManager} orchestrating single-flight audits and SSE streaming.
 */
export function createAuditJobManagerWithPorts(
  options: AuditJobManagerOptions,
  ports: AuditJobManagerPorts,
): AuditJobManager {
  const store = options.store;
  const env = options.env;
  const auditRunner = options.auditRunner ?? ports.defaultAuditRunner;
  const jobRetentionMs = options.jobRetentionMs ?? DEFAULT_JOB_RETENTION_MS;
  const hostSignal = options.signal;

  let activeJob: InternalAuditJob | null = null;
  let retainedJob: InternalAuditJob | null = null;
  let retentionTimer: ReturnType<typeof setTimeout> | null = null;
  let activeAbortController: AbortController | null = null;
  let activeExecution: Promise<void> | null = null;
  let shuttingDown = hostSignal?.aborted === true;

  function clearRetainedJob(): void {
    retainedJob = null;
    if (retentionTimer !== null) {
      clearTimeout(retentionTimer);
      retentionTimer = null;
    }
  }

  function findJob(jobId: string): InternalAuditJob | null {
    if (activeJob?.snapshot.id === jobId) {
      return activeJob;
    }
    if (retainedJob?.snapshot.id === jobId) {
      return retainedJob;
    }
    return null;
  }

  function finalizeJob(
    job: InternalAuditJob,
    terminalEvent: NonNullable<InternalAuditJob["terminalEvent"]>,
  ): void {
    job.terminalEvent = terminalEvent;
    activeJob = null;

    if (shuttingDown || hostSignal?.aborted === true) {
      retainedJob = null;
    } else {
      retainedJob = job;
      const timer = setTimeout(() => {
        if (retainedJob?.snapshot.id === job.snapshot.id) {
          retainedJob = null;
        }
        retentionTimer = null;
      }, jobRetentionMs);
      timer.unref?.();
      retentionTimer = timer;
    }

    for (const subscriber of job.subscribers) {
      subscriber(terminalEvent);
    }
    job.subscribers.clear();
  }

  async function executeJob(
    job: InternalAuditJob,
    request: NormalizedLighthouseAuditRequest,
    abortController: AbortController,
  ): Promise<void> {
    const jobId = job.snapshot.id;
    const effectiveSignal = hostSignal
      ? AbortSignal.any([hostSignal, abortController.signal])
      : abortController.signal;

    try {
      const batch = await auditRunner({
        url: request.url,
        formFactor: request.formFactor,
        throttlingMethod: request.throttlingMethod,
        runs: request.runs,
        categories: request.categories,
        env,
        signal: effectiveSignal,
        onProgress: (event) => {
          if (
            event.stage === "complete" ||
            effectiveSignal.aborted ||
            shuttingDown
          ) {
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

      if (effectiveSignal.aborted || shuttingDown) {
        throw new AuditCancelledError(
          "Lighthouse audit cancelled during shutdown",
        );
      }

      let persisted: LighthouseAuditExecutionResult;
      let serializedRun: LighthouseRunDetail;
      try {
        persisted = store.persistBatch(batch, { signal: effectiveSignal });
        serializedRun = ports.serializeRunDetail(
          persisted.run,
          store.resolveArtifactsDir(),
        );
      } catch (persistErr: unknown) {
        if (persistErr instanceof AuditCancelledError) {
          throw persistErr;
        }
        throw new Error("Failed to persist completed audit results", {
          cause: persistErr,
        });
      }

      job.snapshot.status = "completed";
      job.snapshot.completedAt = new Date().toISOString();
      job.snapshot.runId = persisted.run.id;

      finalizeJob(job, {
        type: "complete",
        data: {
          jobId,
          status: "completed",
          runId: persisted.run.id,
          run: serializedRun,
        },
      });
    } catch (err: unknown) {
      const jobError = ports.serializeError(err);
      job.snapshot.status = "failed";
      job.snapshot.completedAt = new Date().toISOString();
      job.snapshot.error = jobError;

      finalizeJob(job, {
        type: "error",
        data: {
          jobId,
          status: "failed",
          error: jobError,
        },
      });
    }
  }

  const manager: AuditJobManager = {
    get isShuttingDown(): boolean {
      return shuttingDown || hostSignal?.aborted === true;
    },

    startJob(
      request: NormalizedLighthouseAuditRequest,
    ):
      | { started: true; job: AuditJob }
      | { started: false; activeJobId: string } {
      if (shuttingDown || hostSignal?.aborted === true) {
        throw new Error("AuditJobManager is shutting down");
      }

      if (activeJob && activeJob.snapshot.status === "running") {
        return {
          started: false,
          activeJobId: activeJob.snapshot.id,
        };
      }

      clearRetainedJob();

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

      const abortController = new AbortController();
      activeJob = internalJob;
      activeAbortController = abortController;

      const execution = executeJob(
        internalJob,
        request,
        abortController,
      ).finally(() => {
        if (activeExecution === execution) {
          activeExecution = null;
        }
        if (activeAbortController === abortController) {
          activeAbortController = null;
        }
      });
      activeExecution = execution;

      return {
        started: true,
        job: cloneAuditJob(internalJob.snapshot),
      };
    },

    getActiveJob(): AuditJob | null {
      if (activeJob && activeJob.snapshot.status === "running") {
        return cloneAuditJob(activeJob.snapshot);
      }
      return null;
    },

    hasJob(jobId: string): boolean {
      return findJob(jobId) !== null;
    },

    subscribe(
      jobId: string,
      listener: (event: AuditJobStreamEvent) => void,
    ): { initialTerminal: boolean; unsubscribe: () => void } | null {
      const job = findJob(jobId);
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
    },

    async shutdown(): Promise<void> {
      shuttingDown = true;
      hostSignal?.removeEventListener("abort", onHostAbort);
      clearRetainedJob();
      activeAbortController?.abort(new Error("Server shutdown requested"));
      await activeExecution;
    },
  };

  function onHostAbort(): void {
    void manager.shutdown();
  }

  if (hostSignal && !hostSignal.aborted) {
    hostSignal.addEventListener("abort", onHostAbort, { once: true });
  }

  return manager;
}
