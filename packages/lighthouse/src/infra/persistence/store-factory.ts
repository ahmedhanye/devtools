import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EnvMap } from "@devtools/core";
import type { DbSession, DevtoolsDb } from "@devtools/db";
import type {
  ExecuteLighthouseBatchOptions,
  LighthouseStore,
} from "../../application";
import {
  resolveArtifactsTargetDir,
  resolveSafeHtmlReportPath,
} from "../../config";
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
 * Configuration options for creating a {@link LighthouseStore} backed by a borrowed {@link DbSession}.
 */
export interface LighthouseStoreOptions {
  /** Caller-borrowed `@devtools/db` session (never closed by the store). */
  db: DbSession;
  /** Optional explicit artifacts base directory override. */
  artifactsDir?: string;
  /** Optional isolated environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Optional working directory getter seam overriding `process.cwd()`. */
  cwd?: () => string;
  /** Optional standalone binary runtime seam overriding `Bun.isStandaloneExecutable`. */
  isStandalone?: boolean;
}

/**
 * Creates a SQLite + artifact {@link LighthouseStore} over a borrowed {@link DbSession}
 * and an injected multi-run batch executor.
 *
 * @param options - Borrowed DB session and optional artifact directory seams.
 * @param runBatch - Batch execution runner used by {@link LighthouseStore.runAudit}.
 * @returns Stateful {@link LighthouseStore} without DB connection ownership.
 */
export function createSqliteLighthouseStore(
  options: LighthouseStoreOptions,
  runBatch: (
    batchOptions: ExecuteLighthouseBatchOptions,
  ) => Promise<LighthouseBatchExecutionResult>,
): LighthouseStore {
  const dbSession = options.db;

  const getArtifactsTargetDir = (overrideDir?: string): string =>
    resolveArtifactsTargetDir({
      customDir: overrideDir ?? options.artifactsDir,
      env: options.env,
      cwd: options.cwd,
      isStandalone: options.isStandalone,
    });

  const getRun = (idOrPrefix?: string) =>
    dbSession.read((db) =>
      idOrPrefix !== undefined
        ? resolveLighthouseRun(db, idOrPrefix)
        : getLatestLighthouseRun(db),
    );

  const persistBatch: LighthouseStore["persistBatch"] = (
    batch,
    persistOptions = {},
  ) => {
    throwIfAborted(persistOptions.signal);

    const runId = randomUUID();
    const baseArtifactsDir = getArtifactsTargetDir(persistOptions.artifactsDir);
    const runArtifactDir = join(baseArtifactsDir, runId);
    const jsonReportPath = join(runArtifactDir, "report.json");
    const htmlReportPath = join(runArtifactDir, "report.html");
    const { normalized } = batch;

    let run: LighthouseAuditExecutionResult["run"];
    let previousRun: LighthouseAuditExecutionResult["previousRun"];
    try {
      mkdirSync(runArtifactDir, { recursive: true });
      writeFileSync(jsonReportPath, batch.reportJson, "utf-8");
      writeFileSync(htmlReportPath, batch.reportHtml, "utf-8");

      const txResult = dbSession.write((tx) => {
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
      try {
        rmSync(runArtifactDir, { recursive: true, force: true });
      } catch {
        // Ignore rollback cleanup errors so the primary failure propagates intact
      }
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

  return {
    dbPath: dbSession.path,

    resolveArtifactsDir(overrideDir) {
      return getArtifactsTargetDir(overrideDir);
    },

    ensureReady() {
      dbSession.ensureReady();
    },

    insertRun(row) {
      return dbSession.write((tx) => insertLighthouseRun(tx, row));
    },

    listRuns(listOptions) {
      return dbSession.read((db) => listLighthouseRuns(db, listOptions));
    },

    listRunsWithTotal(listOptions) {
      return dbSession.read((db) =>
        listLighthouseRunsWithTotal(db, listOptions),
      );
    },

    getRun,

    findPreviousRun(findOptions) {
      return dbSession.read((db) => findPreviousLighthouseRun(db, findOptions));
    },

    diffRuns(baselineIdOrPrefix, comparisonIdOrPrefix) {
      return dbSession.read((db) =>
        db.transaction(
          (tx) => {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Drizzle SQLiteTransaction exposes the full DevtoolsDb query surface inside transactions.
            const txDb = tx as unknown as DevtoolsDb;
            const baseline = resolveLighthouseRun(txDb, baselineIdOrPrefix);
            const comparison = resolveLighthouseRun(txDb, comparisonIdOrPrefix);
            return {
              baseline,
              comparison,
              deltas: computeRunDeltas(baseline, comparison),
            };
          },
          { behavior: "deferred" },
        ),
      );
    },

    resolveReportHtmlPath(idOrPrefix) {
      const run = getRun(idOrPrefix);
      const safePath = resolveSafeHtmlReportPath(
        run.htmlReportPath,
        getArtifactsTargetDir(),
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
        signal: auditOptions.signal,
      });
    },
  };
}
