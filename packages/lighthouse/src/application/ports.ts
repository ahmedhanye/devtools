import type {
  BrowserResolution,
  ResolveBrowserOptions,
} from "@devtools/browser";
import type { EnvMap } from "@devtools/core";
import type {
  FindPreviousRunOptions,
  LighthouseAuditExecutionResult,
  LighthouseBatchExecutionResult,
  LighthouseDiffDeltas,
  LighthouseFormFactor,
  LighthouseProgressEvent,
  LighthouseRunRecord,
  LighthouseThrottlingMethod,
  ListLighthouseRunsOptions,
  NewLighthouseRunRecord,
  SingleIterationResult,
} from "../contracts";

/**
 * Input parameters passed to the single-iteration executor (`executeIteration`).
 */
export interface ExecuteIterationParams {
  url: string;
  formFactor: LighthouseFormFactor;
  throttlingMethod: LighthouseThrottlingMethod;
  categories: readonly string[];
  browser?: BrowserResolution;
  chromePath?: string;
  disableSandbox?: boolean;
  env?: EnvMap;
  runIndex: number;
  totalRuns: number;
  onProgress?: (event: LighthouseProgressEvent) => void;
  signal?: AbortSignal;
}

/**
 * Injectable executor function signature for running a single Lighthouse iteration.
 */
export type LighthouseIterationExecutor = (
  params: ExecuteIterationParams,
) => Promise<SingleIterationResult>;

/**
 * Port signature for resolving an available Chromium executable before batch execution.
 */
export type BrowserResolverPort = (
  options?: ResolveBrowserOptions,
) => Promise<BrowserResolution>;

/**
 * Runtime ports injected by composition wiring into {@link executeBatchWithPorts}.
 */
export interface ExecuteBatchPorts {
  /** Default single-iteration executor when `options.executor` is omitted. */
  executeIteration: LighthouseIterationExecutor;
  /** Default browser discovery resolver when `options.resolveBrowser` is omitted. */
  resolveBrowser: BrowserResolverPort;
}

/**
 * Options for executing a full Lighthouse audit via {@link LighthouseStore.runAudit}.
 */
export interface RunLighthouseAuditOptions {
  /** Target URL to audit (`http://` or `https://`). */
  url: string;
  /** Device emulation preset (`"mobile"` or `"desktop"`). Defaults to `"mobile"`. */
  formFactor?: LighthouseFormFactor;
  /** Network/CPU throttling method. Defaults to `"simulate"`. */
  throttlingMethod?: LighthouseThrottlingMethod;
  /** Number of audit iterations to run before selecting the Representative Run. Defaults to `1`. */
  runs?: number;
  /** Explicit list of Lighthouse categories to audit. Defaults to the 4 standard categories. */
  categories?: readonly string[];
  /** Optional pre-resolved browser metadata overriding discovery across multi-run batches. */
  browser?: BrowserResolution;
  /** Optional explicit Chromium binary path override (`--chrome-path`). */
  chromePath?: string;
  /** Optional flag to force disable or enable Chromium sandboxing (`--no-sandbox`). */
  disableSandbox?: boolean;
  /** Optional explicit artifacts base directory override. */
  artifactsDir?: string;
  /** Optional isolated environment map seam overriding `process.env`. */
  env?: EnvMap;
  /** Optional browser resolver seam overriding default Chromium discovery. */
  resolveBrowser?: BrowserResolverPort;
  /** Optional progress callback invoked across audit stages and multi-run iterations. */
  onProgress?: (event: LighthouseProgressEvent) => void;
  /** Optional cancellation signal aborting Chrome launch and multi-run iteration loops. */
  signal?: AbortSignal;
  /** Optional injectable single-iteration executor seam for hermetic unit testing. */
  executor?: LighthouseIterationExecutor;
}

/**
 * Options for executing a SQLite-free multi-run Lighthouse batch via `executeLighthouseBatch`.
 */
export type ExecuteLighthouseBatchOptions = Omit<
  RunLighthouseAuditOptions,
  "artifactsDir"
>;

/**
 * Unified domain store managing Lighthouse SQLite persistence and cold report artifacts.
 */
export interface LighthouseStore {
  /** Resolved SQLite target path (`":memory:"` or absolute filesystem path). */
  readonly dbPath: string;
  /** Resolves (and creates if missing) the cold report artifacts root directory. */
  resolveArtifactsDir(overrideDir?: string): string;
  /** Eagerly opens the underlying SQLite handle and verifies schema readiness. */
  ensureReady(): void;
  /** Inserts a canonical {@link NewLighthouseRunRecord} inside an immediate write transaction. */
  insertRun(row: NewLighthouseRunRecord): LighthouseRunRecord;
  /** Lists persisted runs ordered by `createdAt` descending. */
  listRuns(options?: ListLighthouseRunsOptions): LighthouseRunRecord[];
  /** Lists paginated runs alongside total matching count in one read snapshot. */
  listRunsWithTotal(options?: ListLighthouseRunsOptions): {
    runs: LighthouseRunRecord[];
    total: number;
  };
  /** Resolves a run by full ID or 6+ char prefix, or the latest run when `idOrPrefix` is omitted. */
  getRun(idOrPrefix?: string): LighthouseRunRecord;
  /** Finds the most recent prior run for the same `url` and `formFactor`. */
  findPreviousRun(options: FindPreviousRunOptions): LighthouseRunRecord | null;
  /** Resolves both runs and computes score, metric, and insight deltas in one read snapshot. */
  diffRuns(
    baselineIdOrPrefix: string,
    comparisonIdOrPrefix: string,
  ): {
    baseline: LighthouseRunRecord;
    comparison: LighthouseRunRecord;
    deltas: LighthouseDiffDeltas;
  };
  /** Resolves a run and validates its confined `report.html` path inside `artifactsDir`. */
  resolveReportHtmlPath(idOrPrefix?: string): {
    run: LighthouseRunRecord;
    safePath: string | null;
  };
  /** Writes cold `report.{json,html}` artifacts and inserts the run row + previous baseline atomically. */
  persistBatch(
    batch: LighthouseBatchExecutionResult,
    options?: {
      artifactsDir?: string;
      onProgress?: (event: LighthouseProgressEvent) => void;
    },
  ): LighthouseAuditExecutionResult;
  /** Executes a multi-run Lighthouse audit batch and persists its representative run unless aborted. */
  runAudit(
    options: RunLighthouseAuditOptions,
  ): Promise<LighthouseAuditExecutionResult>;
  /** Releases the owned `@devtools/db` handle (no-op if caller supplied `options.db`). */
  close(): void;
  /** Disposes this store automatically when used with `using`. */
  [Symbol.dispose](): void;
}
