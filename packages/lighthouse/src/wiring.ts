import { resolveBrowserPath } from "@devtools/browser";
import {
  executeBatchWithPorts,
  type ExecuteLighthouseBatchOptions,
  type LighthouseStore,
} from "./application";
import type { LighthouseBatchExecutionResult } from "./contracts";
import {
  createSqliteLighthouseStore,
  type LighthouseStoreOptions,
} from "./infra/persistence/store-factory";
import { executeIteration } from "./infra/runtime/iteration";

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
  });
}

/**
 * Opens a lazy, concurrency-safe {@link LighthouseStore} owning SQLite persistence
 * (`openDb`) and cold report artifact resolution for Lighthouse Audit Runs.
 *
 * @param options - Optional path, memory isolation, artifacts directory, env, and shutdown registry seams.
 * @returns Managed {@link LighthouseStore} handle.
 */
export function openLighthouseStore(
  options: LighthouseStoreOptions = {},
): LighthouseStore {
  return createSqliteLighthouseStore(options, executeLighthouseBatch);
}
