import { API_ERROR_CODES } from "@devtools/core";
import type {
  ExecuteLighthouseBatchOptions,
  LighthouseBatchExecutionResult,
} from "@devtools/lighthouse";
import type { WorkerOutboundMessage } from "./worker-handler";

/**
 * Function signature for executing a Lighthouse batch either via the production Bun `Worker`
 * or an injected fast test seam on `CreateAppOptions.auditRunner`.
 */
export type LighthouseAuditRunner = (
  params: ExecuteLighthouseBatchOptions,
) => Promise<LighthouseBatchExecutionResult>;

/**
 * Minimal structural subset of the Web/Bun `Worker` interface used by {@link createWorkerAuditRunner}.
 */
export interface WorkerLike {
  addEventListener: (type: string, listener: (event: never) => void) => void;
  postMessage: (message: unknown) => void;
  terminate: () => void;
}

/**
 * Error raised on the parent HTTP thread when the Lighthouse execution `Worker` fails
 * or terminates abnormally.
 */
export class AuditWorkerError extends Error {
  /** Machine-readable error code propagated from the worker or `INTERNAL_ERROR`. */
  readonly code: string;

  /**
   * Creates an {@link AuditWorkerError}.
   *
   * @param code - Machine-readable error identifier.
   * @param message - Human-readable diagnostic message.
   */
  constructor(code: string, message: string) {
    super(message);
    this.name = "AuditWorkerError";
    this.code = code;
  }
}

/**
 * Resolves the Lighthouse `Worker` entrypoint URL for both unbundled source execution
 * (`./worker.ts`) and multi-entry compiled Bun binaries (`/$bunfs/root/...`).
 *
 * @param metaUrl - Optional module URL seam defaulting to `import.meta.url`.
 * @returns Worker script URL or embedded `/$bunfs/` path.
 */
export function resolveLighthouseWorkerUrl(
  metaUrl: string = import.meta.url,
): string {
  if (metaUrl.includes("/$bunfs/")) {
    return "/$bunfs/root/api/src/lighthouse/worker.js";
  }
  return new URL("./worker.ts", metaUrl).href;
}

/**
 * Builds a {@link LighthouseAuditRunner} backed by an isolated Bun `Worker` thread so
 * CPU-heavy Lighthouse phases never block the HTTP/SSE event loop.
 *
 * @param options - Optional worker factory seam for hermetic unit tests.
 * @returns Asynchronous runner forwarding progress events and resolving the batch result.
 */
export function createWorkerAuditRunner(
  options: { createWorker?: () => WorkerLike } = {},
): LighthouseAuditRunner {
  const spawnWorker =
    options.createWorker ?? (() => new Worker(resolveLighthouseWorkerUrl()));

  return (params) =>
    new Promise<LighthouseBatchExecutionResult>((resolve, reject) => {
      const worker = spawnWorker();
      let settled = false;

      const finish = (cb: () => void) => {
        if (settled) return;
        settled = true;
        worker.terminate();
        cb();
      };

      worker.addEventListener(
        "message",
        (event: MessageEvent<WorkerOutboundMessage>) => {
          const msg = event.data;
          if (msg.type === "progress") {
            params.onProgress?.(msg.event);
            return;
          }
          if (msg.type === "complete") {
            finish(() => resolve(msg.result));
            return;
          }
          finish(() =>
            reject(new AuditWorkerError(msg.error.code, msg.error.message)),
          );
        },
      );

      worker.addEventListener("error", (event: ErrorEvent) => {
        finish(() =>
          reject(
            new AuditWorkerError(
              API_ERROR_CODES.INTERNAL_ERROR,
              event.message || "Lighthouse worker thread crashed",
            ),
          ),
        );
      });

      worker.addEventListener("messageerror", () => {
        finish(() =>
          reject(
            new AuditWorkerError(
              API_ERROR_CODES.INTERNAL_ERROR,
              "Failed to deserialize Lighthouse worker message",
            ),
          ),
        );
      });

      const outbound = {
        type: "run",
        payload: {
          url: params.url,
          formFactor: params.formFactor,
          throttlingMethod: params.throttlingMethod,
          runs: params.runs,
          categories: params.categories,
          chromePath: params.chromePath,
          disableSandbox: params.disableSandbox,
          env: params.env,
        },
      };
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated Worker.postMessage takes (message, transfer?), not targetOrigin
      worker.postMessage(outbound);
    });
}

/**
 * Default production {@link LighthouseAuditRunner} executing audits on a dedicated Bun `Worker`.
 */
export const runAuditInWorker = createWorkerAuditRunner();
