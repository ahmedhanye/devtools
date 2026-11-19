import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EnvMap } from "@devtools/core";
import type { ShutdownRegistry } from "@devtools/core/node";
import { openDb, type DbHandle } from "@devtools/db";
import type {
  ExecuteLighthouseBatchOptions,
  LighthouseStore,
} from "../../application";
import { resolveArtifactsDir, resolveSafeHtmlReportPath } from "../../config";
import type {
  LighthouseAuditExecutionResult,
  LighthouseBatchExecutionResult,
} from "../../contracts";
import { computeRunDeltas, throwIfAborted } from "../../domain";
import {
  findPreviousLighthouseRun,
  getLatestLighthouseRun,
  insertLighthouseRun,
  listLighthouseRuns,
  listLighthouseRunsWithTotal,
  resolveLighthouseRun,
} from "./sqlite-runs";

/**
 * Configuration options for creating a lazy {@link LighthouseStore} via `openLighthouseStore`.
 */
export interface LighthouseStoreOptions {
  /** Optional explicit SQLite database path or `":memory:"`. */
  dbPath?: string;
  /** Force an isolated in-memory SQLite store (`":memory:"`). */
  memory?: boolean;
  /**
   * Automatically initialize the empty SQLite schema on first access.
   * Pass `false` only in negative error-boundary tests.
   * @defaultValue true
   */
  autoInit?: boolean;
  /** Optional pre-opened `@devtools/db` handle (caller retains ownership on `close()`). */
  db?: DbHandle;
  /** Optional explicit artifacts base directory override. */
  artifactsDir?: string;
  /** Optional isolated environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Optional working directory getter seam overriding `process.cwd()`. */
  cwd?: () => string;
  /** Optional standalone binary runtime seam overriding `Bun.isStandaloneExecutable`. */
  isStandalone?: boolean;
  /** Optional shutdown registry for Phase 3 (`"persistence"`) cleanup hook registration. */
  shutdown?: ShutdownRegistry;
}

/**
 * Creates a managed SQLite + artifact {@link LighthouseStore} backed by `@devtools/db`
 * and an injected multi-run batch executor.
 */
export function createSqliteLighthouseStore(
  options: LighthouseStoreOptions,
  runBatch: (
    batchOptions: ExecuteLighthouseBatchOptions,
  ) => Promise<LighthouseBatchExecutionResult>,
): LighthouseStore {
  const ownsDb = options.db === undefined;
  const dbHandle =
    options.db ??
    openDb({
      path: options.dbPath,
      memory: options.memory,
      autoInit: options.autoInit,
      env: options.env,
      cwd: options.cwd,
      isStandalone: options.isStandalone,
      shutdown: options.shutdown,
    });

  const getArtifactsDir = (overrideDir?: string): string =>
    resolveArtifactsDir({
      customDir: overrideDir ?? options.artifactsDir,
      env: options.env,
      cwd: options.cwd,
      isStandalone: options.isStandalone,
    });

  const getRun = (idOrPrefix?: string) =>
    dbHandle.read((db) =>
      idOrPrefix !== undefined
        ? resolveLighthouseRun(db, idOrPrefix)
        : getLatestLighthouseRun(db),
    );

  const persistBatch: LighthouseStore["persistBatch"] = (
    batch,
    persistOptions = {},
  ) => {
    const runId = randomUUID();
    const baseArtifactsDir = getArtifactsDir(persistOptions.artifactsDir);
    const runArtifactDir = join(baseArtifactsDir, runId);
    mkdirSync(runArtifactDir, { recursive: true });

    const jsonReportPath = join(runArtifactDir, "report.json");
    const htmlReportPath = join(runArtifactDir, "report.html");
    writeFileSync(jsonReportPath, batch.reportJson, "utf-8");
    writeFileSync(htmlReportPath, batch.reportHtml, "utf-8");

    const { normalized } = batch;
    let run: LighthouseAuditExecutionResult["run"];
    let previousRun: LighthouseAuditExecutionResult["previousRun"];
    try {
      const txResult = dbHandle.write((tx) => {
        const previous = findPreviousLighthouseRun(tx, {
          url: batch.validatedUrl,
          formFactor: batch.formFactor,
        });
        const inserted = insertLighthouseRun(tx, {
          id: runId,
          url: batch.validatedUrl,
          finalUrl: normalized.finalUrl || batch.validatedUrl,
          formFactor: batch.formFactor,
          throttlingMethod: batch.throttlingMethod,
          performanceScore: normalized.scores.performanceScore,
          accessibilityScore: normalized.scores.accessibilityScore,
          bestPracticesScore: normalized.scores.bestPracticesScore,
          seoScore: normalized.scores.seoScore,
          lcpMs: normalized.metrics.lcpMs,
          cls: normalized.metrics.cls,
          tbtMs: normalized.metrics.tbtMs,
          fcpMs: normalized.metrics.fcpMs,
          siMs: normalized.metrics.siMs,
          ttfbMs: normalized.metrics.ttfbMs,
          summaryJson: normalized.summary,
          jsonReportPath,
          htmlReportPath,
          durationMs: batch.durationMs,
        });
        return { run: inserted, previousRun: previous };
      });
      run = txResult.run;
      previousRun = txResult.previousRun;
    } catch (err: unknown) {
      rmSync(runArtifactDir, { recursive: true, force: true });
      throw err;
    }

    persistOptions.onProgress?.({
      stage: "complete",
      message: `Lighthouse audit complete (${runId})`,
      runIndex: batch.representativeRunIndex,
      totalRuns: batch.totalRuns,
    });

    return {
      run,
      previousRun,
      normalized,
      representativeRunIndex: batch.representativeRunIndex,
    };
  };

  const close = (): void => {
    if (ownsDb) {
      dbHandle.close();
    }
  };

  return {
    dbPath: dbHandle.path,

    resolveArtifactsDir(overrideDir) {
      return getArtifactsDir(overrideDir);
    },

    ensureReady() {
      dbHandle.ensureReady();
    },

    insertRun(row) {
      return dbHandle.write((tx) => insertLighthouseRun(tx, row));
    },

    listRuns(listOptions) {
      return dbHandle.read((db) => listLighthouseRuns(db, listOptions));
    },

    listRunsWithTotal(listOptions) {
      return dbHandle.read((db) =>
        listLighthouseRunsWithTotal(db, listOptions),
      );
    },

    getRun,

    findPreviousRun(findOptions) {
      return dbHandle.read((db) => findPreviousLighthouseRun(db, findOptions));
    },

    diffRuns(baselineIdOrPrefix, comparisonIdOrPrefix) {
      return dbHandle.read((db) => {
        const baseline = resolveLighthouseRun(db, baselineIdOrPrefix);
        const comparison = resolveLighthouseRun(db, comparisonIdOrPrefix);
        return {
          baseline,
          comparison,
          deltas: computeRunDeltas(baseline, comparison),
        };
      });
    },

    resolveReportHtmlPath(idOrPrefix) {
      const run = getRun(idOrPrefix);
      const safePath = resolveSafeHtmlReportPath(
        run.htmlReportPath,
        getArtifactsDir(),
      );
      return { run, safePath };
    },

    persistBatch,

    async runAudit(auditOptions) {
      const batch = await runBatch({
        ...auditOptions,
        env: auditOptions.env ?? options.env,
      });
      throwIfAborted(auditOptions.signal);
      return persistBatch(batch, {
        artifactsDir: auditOptions.artifactsDir,
        onProgress: auditOptions.onProgress,
      });
    },

    close,

    [Symbol.dispose]() {
      close();
    },
  };
}
