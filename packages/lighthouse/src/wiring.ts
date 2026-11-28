import { resolveBrowserPath } from "@devtools/browser";
import {
  createAuditJobManagerWithPorts,
  executeBatchWithPorts,
  type AuditJobManager,
  type AuditJobManagerOptions,
  type ExecuteLighthouseBatchOptions,
  type LighthouseStore,
} from "./application";
import type { LighthouseBatchExecutionResult } from "./contracts";
import {
  serializeAuditError,
  serializeLighthouseRunDetail,
} from "./serializers";
import {
  createSqliteLighthouseStore,
  type LighthouseStoreOptions,
} from "./infra/persistence/store-factory";
export type { LighthouseStoreOptions };
import {
  executeIteration,
  generateLighthouseHtmlReport,
} from "./infra/runtime/iteration";

/**
 * Executes a multi-run Lighthouse batch (`--runs <N>`), selects the Representative Run,
 * and normalizes the LHR without touching SQLite or filesystem artifact storage.
 *
 * @param options - Audit target URL, emulation parameters, and optional executor seam.
 * @returns Serializable batch execution payload ready for parent-thread persistence.
 * @throws {@link InvalidAuditOptionsError} When `options` fails shared schema validation.
 * @throws {@link WorkerExecutionError} When browser launch or Lighthouse execution fails.
 */
export async function executeLighthouseBatch(
  options: ExecuteLighthouseBatchOptions,
): Promise<LighthouseBatchExecutionResult> {
  return executeBatchWithPorts(options, {
    executeIteration,
    resolveBrowser: resolveBrowserPath,
    generateHtmlReport: generateLighthouseHtmlReport,
  });
}

/**
 * Creates a domain-level {@link LighthouseStore} backed by a caller-borrowed
 * {@link DbSession} and cold report artifact resolution without claiming SQLite ownership.
 *
 * @param options - Required borrowed `DbSession` and optional artifacts directory / environment seams.
 * @returns Stateful {@link LighthouseStore} bound to the borrowed session.
 */
export function createLighthouseStore(
  options: LighthouseStoreOptions,
): LighthouseStore {
  return createSqliteLighthouseStore(options, executeLighthouseBatch);
}

/**
 * Creates a request-ready {@link AuditJobManager} wired to the default batch runner
 * and domain serializers without opening SQLite eagerly.
 *
 * @param options - Unified Lighthouse store, runner seam, retention, and optional `AbortSignal`.
 * @returns Stateful single-flight {@link AuditJobManager}.
 */
export function createAuditJobManager(
  options: AuditJobManagerOptions,
): AuditJobManager {
  return createAuditJobManagerWithPorts(options, {
    defaultAuditRunner: executeLighthouseBatch,
    serializeRunDetail: serializeLighthouseRunDetail,
    serializeError: serializeAuditError,
  });
}
