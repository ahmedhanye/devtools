import {
  type InsightDiffSummary,
  type LighthouseDiffDeltas,
  type LighthouseRunRecord,
  type LighthouseRunSummary,
  LighthouseRunSummaryDataSchema,
} from "../contracts";

/**
 * Empty fallback {@link LighthouseRunSummary} used when a persisted `summary_json` payload is malformed.
 */
export const EMPTY_LIGHTHOUSE_RUN_SUMMARY: LighthouseRunSummary = {
  lcpElement: null,
  lcpPhases: null,
  clsCulprits: [],
  insights: [],
  failedAudits: [],
  runWarnings: [],
  runtimeError: null,
  medianMetadata: null,
};

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
 * Parses and validates a raw `summaryJson` column value into {@link LighthouseRunSummary},
 * returning `null` if missing or malformed.
 *
 * @param rawSummary - Raw column value (parsed object, JSON string, or `null`/`undefined`).
 * @returns Validated summary payload or `null`.
 */
export function parseRunSummary(
  rawSummary: unknown,
): LighthouseRunSummary | null {
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
  summary: LighthouseRunSummary,
): Map<string, { id: string; title: string }> {
  const failing = new Map<string, { id: string; title: string }>();
  for (const item of summary.insights ?? []) {
    if (isFailingInsight(item)) {
      failing.set(item.id, { id: item.id, title: item.title });
    }
  }
  return failing;
}

function collectMissingInsights(
  source: Map<string, { id: string; title: string }>,
  other: Map<string, { id: string; title: string }>,
): Array<{ id: string; title: string }> {
  const items: Array<{ id: string; title: string }> = [];
  for (const [id, meta] of source) {
    if (!other.has(id)) {
      items.push(meta);
    }
  }
  return items;
}

/**
 * Computes status transitions for Lighthouse Insight audits and CLS culprits between two runs.
 *
 * @param s1 - Baseline run summary data.
 * @param s2 - Comparison run summary data.
 * @returns Status transitions identifying resolved and regressed audits.
 */
export function computeInsightDiff(
  s1?: LighthouseRunSummary | null,
  s2?: LighthouseRunSummary | null,
): InsightDiffSummary {
  if (!s1 || !s2) {
    return { resolved: [], regressed: [], clsCulpritDelta: null };
  }

  const fail1 = collectFailingInsights(s1);
  const fail2 = collectFailingInsights(s2);

  const resolved = collectMissingInsights(fail1, fail2);
  const regressed = collectMissingInsights(fail2, fail1);

  const culprit1 = s1.clsCulprits?.length ?? 0;
  const culprit2 = s2.clsCulprits?.length ?? 0;
  const clsCulpritDelta = culprit2 - culprit1;

  return { resolved, regressed, clsCulpritDelta };
}

type NumericRunKey = {
  [K in keyof LighthouseRunRecord]: LighthouseRunRecord[K] extends number | null
    ? K
    : never;
}[keyof LighthouseRunRecord];

/**
 * Computes pairwise score, Core Web Vitals, and Insight Audit deltas (`comparison - baseline`)
 * between two persisted {@link LighthouseRunRecord} entries.
 *
 * @param baseline - Baseline run record.
 * @param comparison - Comparison run record.
 * @returns Structured score, metric, and insight delta summary.
 */
export function computeRunDeltas(
  baseline: LighthouseRunRecord,
  comparison: LighthouseRunRecord,
): LighthouseDiffDeltas {
  const baselineSummary = parseRunSummary(baseline.summaryJson);
  const comparisonSummary = parseRunSummary(comparison.summaryJson);
  const delta = (key: NumericRunKey) =>
    computeNumericDelta(baseline[key], comparison[key]);

  return {
    scores: {
      performanceScore: delta("performanceScore"),
      accessibilityScore: delta("accessibilityScore"),
      bestPracticesScore: delta("bestPracticesScore"),
      seoScore: delta("seoScore"),
    },
    metrics: {
      lcpMs: delta("lcpMs"),
      cls: delta("cls"),
      tbtMs: delta("tbtMs"),
      fcpMs: delta("fcpMs"),
      siMs: delta("siMs"),
      ttfbMs: delta("ttfbMs"),
    },
    insights: computeInsightDiff(baselineSummary, comparisonSummary),
  };
}
