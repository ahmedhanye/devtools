import type { LighthouseRunRow, LighthouseRunSummaryData } from "@devtools/db";
import {
  type InsightDiffSummary,
  type LighthouseDiffDeltas,
  LighthouseRunSummaryDataSchema,
} from "./schemas";

export type { InsightDiffSummary };

function isFailingInsight(insight: {
  score: number | null;
  metricSavings?: Record<string, number>;
  estimatedSavingsMs?: number | null;
}): boolean {
  const maxMetricSavings = Object.values(insight.metricSavings ?? {}).reduce(
    (max, val) => Math.max(max, val),
    0,
  );
  const savings = insight.estimatedSavingsMs ?? maxMetricSavings;
  return (insight.score !== null && insight.score < 0.9) || savings > 50;
}

function computeNumericDelta(
  baselineVal: number | null,
  comparisonVal: number | null,
): number | null {
  return comparisonVal !== null && baselineVal !== null
    ? comparisonVal - baselineVal
    : null;
}

/**
 * Parses and validates a raw `summaryJson` column value into {@link LighthouseRunSummaryData},
 * returning `null` if missing or malformed.
 *
 * @param rawSummary - Raw column value (parsed object, JSON string, or `null`/`undefined`).
 * @returns Validated summary payload or `null`.
 */
export function parseRunSummary(
  rawSummary: unknown,
): LighthouseRunSummaryData | null {
  if (!rawSummary) {
    return null;
  }
  let candidate: unknown = rawSummary;
  if (typeof rawSummary === "string") {
    try {
      candidate = JSON.parse(rawSummary);
    } catch {
      return null;
    }
  }
  const parsed = LighthouseRunSummaryDataSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function collectFailingInsights(
  summary: LighthouseRunSummaryData,
): Map<string, { id: string; title: string }> {
  const failing = new Map<string, { id: string; title: string }>();
  for (const item of summary.insights ?? []) {
    if (isFailingInsight(item)) {
      failing.set(item.id, { id: item.id, title: item.title });
    }
  }
  return failing;
}

/**
 * Computes status transitions for Lighthouse Insight audits and CLS culprits between two runs.
 *
 * @param s1 - Baseline run summary data.
 * @param s2 - Comparison run summary data.
 * @returns Status transitions identifying resolved and regressed audits.
 */
export function computeInsightDiff(
  s1?: LighthouseRunSummaryData | null,
  s2?: LighthouseRunSummaryData | null,
): InsightDiffSummary {
  if (!s1 || !s2) {
    return { resolved: [], regressed: [], clsCulpritDelta: null };
  }

  const fail1 = collectFailingInsights(s1);
  const fail2 = collectFailingInsights(s2);

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
 * Computes pairwise score, Core Web Vitals, and Insight Audit deltas (`comparison - baseline`)
 * between two persisted {@link LighthouseRunRow} records.
 *
 * @param baseline - Baseline run record.
 * @param comparison - Comparison run record.
 * @returns Structured score, metric, and insight delta summary.
 */
export function computeRunDeltas(
  baseline: LighthouseRunRow,
  comparison: LighthouseRunRow,
): LighthouseDiffDeltas {
  const baselineSummary = parseRunSummary(baseline.summaryJson);
  const comparisonSummary = parseRunSummary(comparison.summaryJson);

  return {
    scores: {
      performanceScore: computeNumericDelta(
        baseline.performanceScore,
        comparison.performanceScore,
      ),
      accessibilityScore: computeNumericDelta(
        baseline.accessibilityScore,
        comparison.accessibilityScore,
      ),
      bestPracticesScore: computeNumericDelta(
        baseline.bestPracticesScore,
        comparison.bestPracticesScore,
      ),
      seoScore: computeNumericDelta(baseline.seoScore, comparison.seoScore),
    },
    metrics: {
      lcpMs: computeNumericDelta(baseline.lcpMs, comparison.lcpMs),
      cls: computeNumericDelta(baseline.cls, comparison.cls),
      tbtMs: computeNumericDelta(baseline.tbtMs, comparison.tbtMs),
      fcpMs: computeNumericDelta(baseline.fcpMs, comparison.fcpMs),
      siMs: computeNumericDelta(baseline.siMs, comparison.siMs),
      ttfbMs: computeNumericDelta(baseline.ttfbMs, comparison.ttfbMs),
    },
    insights: computeInsightDiff(baselineSummary, comparisonSummary),
  };
}
