import { API_ERROR_CODES, type EnvMap } from "@devtools/core";
import {
  executeLighthouseBatch,
  type LighthouseBatchExecutionResult,
  type LighthouseProgressEvent,
} from "@devtools/lighthouse";
import type {
  AuditJobError,
  LighthouseCategoryId,
  LighthouseFormFactor,
  LighthouseThrottlingMethod,
} from "@devtools/lighthouse/schemas";

/**
 * Structured payload transferred to the dedicated Bun `Worker` thread for audit execution.
 */
export interface WorkerAuditRunPayload {
  url: string;
  formFactor?: LighthouseFormFactor;
  throttlingMethod?: LighthouseThrottlingMethod;
  runs?: number;
  categories?: readonly LighthouseCategoryId[] | readonly string[];
  chromePath?: string;
  disableSandbox?: boolean;
  env?: EnvMap;
}

/**
 * Inbound IPC message received by the Lighthouse execution `Worker`.
 */
export interface WorkerInboundMessage {
  type: "run";
  payload: WorkerAuditRunPayload;
}

/**
 * Outbound IPC message posted back from the Lighthouse `Worker` to the parent HTTP thread.
 */
export type WorkerOutboundMessage =
  | { type: "progress"; event: LighthouseProgressEvent }
  | { type: "complete"; result: LighthouseBatchExecutionResult }
  | { type: "error"; error: AuditJobError };

/**
 * Converts an arbitrary thrown error into a structured {@link AuditJobError} envelope
 * preserving domain error codes (`BROWSER_NOT_FOUND`, `WORKER_EXECUTION_ERROR`, etc.).
 *
 * @param err - Caught error value.
 * @returns Structured error payload suitable for worker IPC and SSE `error` events.
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

/**
 * Executes a {@link WorkerInboundMessage} inside the worker thread using `executeLighthouseBatch`
 * and emits `progress`, `complete`, or `error` frames back to the parent thread.
 *
 * @param message - Inbound execution request.
 * @param deps - Injectable `emit` and batch executor seams for hermetic unit tests.
 */
export async function handleWorkerAuditMessage(
  message: WorkerInboundMessage,
  deps: {
    emit: (msg: WorkerOutboundMessage) => void;
    executeBatch?: typeof executeLighthouseBatch;
  },
): Promise<void> {
  const executeBatch = deps.executeBatch ?? executeLighthouseBatch;
  try {
    const result = await executeBatch({
      ...message.payload,
      onProgress: (event) => {
        deps.emit({ type: "progress", event });
      },
    });
    deps.emit({ type: "complete", result });
  } catch (err: unknown) {
    deps.emit({
      type: "error",
      error: serializeAuditError(err),
    });
  }
}
