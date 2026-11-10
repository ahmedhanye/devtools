import type {
  DevtoolsDb,
  LighthouseRunRow,
  LighthouseRunSummaryData,
} from "@devtools/db";
import { getColors } from "../colors";
import { formatJson } from "./formatters/json";
import { formatTerminalDiff } from "./formatters/terminal";
import { resolveRunId } from "./resolvers";
import type {
  LighthouseDiffCommandDeps,
  LighthouseDiffCommandOptions,
} from "./types";

/**
 * Structured diff comparing Insight audits and CLS culprit elements between runs.
 */
// fallow-ignore-next-line unused-type
export interface InsightDiffSummary {
  resolved: Array<{ id: string; title: string }>;
  regressed: Array<{ id: string; title: string }>;
  clsCulpritDelta: number | null;
}

function isFailingInsight(i: {
  score: number | null;
  metricSavings?: Record<string, number>;
  estimatedSavingsMs?: number | null;
}): boolean {
  const maxMetricSavings = Object.values(i.metricSavings ?? {}).reduce(
    (max, val) => Math.max(max, val),
    0,
  );
  const savings = i.estimatedSavingsMs ?? maxMetricSavings;
  return (i.score !== null && i.score < 0.9) || savings > 50;
}

/**
 * Computes status transitions for Lighthouse Insight audits and CLS culprits between two runs.
 *
 * @param s1 - Baseline run summary data.
 * @param s2 - Comparison run summary data.
 * @returns Status transitions identifying resolved and regressed audits.
 */
// fallow-ignore-next-line unused-export
export function computeInsightDiff(
  s1?: LighthouseRunSummaryData | null,
  s2?: LighthouseRunSummaryData | null,
): InsightDiffSummary {
  if (!s1 || !s2) {
    return { resolved: [], regressed: [], clsCulpritDelta: null };
  }

  const fail1 = new Map<string, { id: string; title: string }>();
  for (const item of s1.insights ?? []) {
    if (isFailingInsight(item)) {
      fail1.set(item.id, { id: item.id, title: item.title });
    }
  }

  const fail2 = new Map<string, { id: string; title: string }>();
  for (const item of s2.insights ?? []) {
    if (isFailingInsight(item)) {
      fail2.set(item.id, { id: item.id, title: item.title });
    }
  }

  const resolved: Array<{ id: string; title: string }> = [];
  for (const [id, meta] of fail1) {
    if (!fail2.has(id)) {
      resolved.push(meta);
    }
  }

  const regressed: Array<{ id: string; title: string }> = [];
  for (const [id, meta] of fail2) {
    if (!fail1.has(id)) {
      regressed.push(meta);
    }
  }

  const culprit1 = s1.clsCulprits?.length ?? 0;
  const culprit2 = s2.clsCulprits?.length ?? 0;
  const clsCulpritDelta = culprit2 - culprit1;

  return { resolved, regressed, clsCulpritDelta };
}

/**
 * Executes the `devtools lighthouse diff <id1> <id2>` command, displaying pairwise
 * score, CWV, and insight differences between two historical audit runs.
 *
 * @param id1 - Baseline run ID or unique prefix.
 * @param id2 - Comparison run ID or unique prefix.
 * @param options - Parsed CLI diff options.
 * @param deps - Injected dependencies for hermetic testing.
 */
export async function runLighthouseDiffCommand(
  id1: string,
  id2: string,
  options: LighthouseDiffCommandOptions = {},
  deps?: LighthouseDiffCommandDeps,
): Promise<void> {
  const isStderrTTY =
    deps?.isStderrTTY ?? deps?.isTTY ?? Boolean(process.stderr.isTTY);
  const pc = getColors({
    env: options.env as NodeJS.ProcessEnv,
    isTTY: isStderrTTY,
  });
  const exit = (code = 1) => {
    if (deps?.exit) {
      deps.exit(code);
      return;
    }
    process.exit(code);
  };

  const log = deps?.log ?? console.log;
  const error = deps?.error ?? console.error;
  const getDb = deps?.getDb ?? (await import("@devtools/db")).getDb;

  let db: DevtoolsDb;
  try {
    db = getDb();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(pc.red(`Error connecting to database: ${message}`));
    exit(1);
    return;
  }

  let run1: LighthouseRunRow;
  let run2: LighthouseRunRow;

  try {
    run1 = resolveRunId(db, id1);
    run2 = resolveRunId(db, id2);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(pc.red(`Error resolving audit runs: ${message}`));
    exit(1);
    return;
  }

  let summary1: LighthouseRunSummaryData | null = null;
  let summary2: LighthouseRunSummaryData | null = null;
  try {
    if (run1.summaryJson) {
      summary1 =
        typeof run1.summaryJson === "string"
          ? (JSON.parse(run1.summaryJson) as LighthouseRunSummaryData)
          : (run1.summaryJson as unknown as LighthouseRunSummaryData);
    }
  } catch {
    summary1 = null;
  }
  try {
    if (run2.summaryJson) {
      summary2 =
        typeof run2.summaryJson === "string"
          ? (JSON.parse(run2.summaryJson) as LighthouseRunSummaryData)
          : (run2.summaryJson as unknown as LighthouseRunSummaryData);
    }
  } catch {
    summary2 = null;
  }

  const insightDiff = computeInsightDiff(summary1, summary2);

  if (options.json) {
    const payload = {
      baseline: run1,
      comparison: run2,
      deltas: {
        scores: {
          performanceScore:
            run2.performanceScore !== null && run1.performanceScore !== null
              ? run2.performanceScore - run1.performanceScore
              : null,
          accessibilityScore:
            run2.accessibilityScore !== null && run1.accessibilityScore !== null
              ? run2.accessibilityScore - run1.accessibilityScore
              : null,
          bestPracticesScore:
            run2.bestPracticesScore !== null && run1.bestPracticesScore !== null
              ? run2.bestPracticesScore - run1.bestPracticesScore
              : null,
          seoScore:
            run2.seoScore !== null && run1.seoScore !== null
              ? run2.seoScore - run1.seoScore
              : null,
        },
        metrics: {
          lcpMs:
            run2.lcpMs !== null && run1.lcpMs !== null
              ? run2.lcpMs - run1.lcpMs
              : null,
          cls:
            run2.cls !== null && run1.cls !== null ? run2.cls - run1.cls : null,
          tbtMs:
            run2.tbtMs !== null && run1.tbtMs !== null
              ? run2.tbtMs - run1.tbtMs
              : null,
          fcpMs:
            run2.fcpMs !== null && run1.fcpMs !== null
              ? run2.fcpMs - run1.fcpMs
              : null,
          siMs:
            run2.siMs !== null && run1.siMs !== null
              ? run2.siMs - run1.siMs
              : null,
          ttfbMs:
            run2.ttfbMs !== null && run1.ttfbMs !== null
              ? run2.ttfbMs - run1.ttfbMs
              : null,
        },
        insights: insightDiff,
      },
    };
    log(formatJson(payload));
  } else {
    log(formatTerminalDiff(run1, run2, insightDiff));
  }
}
