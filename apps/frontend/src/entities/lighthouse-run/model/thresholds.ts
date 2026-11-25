import type {
  LighthouseCategoryId,
  LighthouseFormFactor,
  LighthouseInsightItem,
  LighthouseProgressStage,
  LighthouseRunListItem,
  LighthouseThrottlingMethod,
} from "@devtools/lighthouse/schemas";
import type { RadialGaugeTone } from "@/shared/ui";

/**
 * Supported Core Web Vitals keys normalized on {@link LighthouseRunListItem}.
 */
export type CwvMetricKey =
  "lcpMs" | "cls" | "tbtMs" | "fcpMs" | "siMs" | "ttfbMs";

/**
 * Standardized Google Web Vitals rating band.
 */
export type CwvRating = "good" | "needs-improvement" | "poor" | "unknown";

/**
 * Human-readable labels for the four audited Lighthouse categories.
 */
export const CATEGORY_LABELS: Record<LighthouseCategoryId, string> = {
  performance: "Performance",
  accessibility: "Accessibility",
  "best-practices": "Best Practices",
  seo: "SEO",
};

/**
 * Human-readable labels for Lighthouse device emulation profiles.
 */
export const FORM_FACTOR_LABELS: Record<LighthouseFormFactor, string> = {
  mobile: "Mobile",
  desktop: "Desktop",
};

/**
 * Human-readable labels for Lighthouse throttling profiles.
 */
export const THROTTLING_METHOD_LABELS: Record<
  LighthouseThrottlingMethod,
  string
> = {
  simulate: "Simulate (Lantern)",
  devtools: "DevTools (CDP)",
  provided: "Provided (Unthrottled)",
};

/**
 * Ordered Audit Job execution stages matching `@devtools/lighthouse`.
 */
export const PROGRESS_STAGE_ORDER: readonly LighthouseProgressStage[] = [
  "locating_browser",
  "launching_browser",
  "navigating",
  "analyzing",
  "generating_report",
  "complete",
];

/**
 * Active Audit Job execution stages rendered in the live progress tracker (excludes terminal `complete`).
 */
export const ACTIVE_PROGRESS_STAGE_ORDER: readonly LighthouseProgressStage[] = [
  "locating_browser",
  "launching_browser",
  "navigating",
  "analyzing",
  "generating_report",
];

const ITERATION_STAGE_OFFSET: Partial<Record<LighthouseProgressStage, number>> =
  {
    launching_browser: 0,
    navigating: 1,
    analyzing: 2,
  };

/**
 * Computes a monotonically increasing `0-100` progress percentage across multi-iteration batches.
 */
export function computeAuditProgressPercent(
  stage: LighthouseProgressStage,
  runIndex?: number,
  totalRuns?: number,
): number {
  if (stage === "complete" || stage === "generating_report") {
    return 100;
  }
  const runs = Math.max(1, totalRuns ?? 1);
  const totalSteps = 3 * runs + 2;
  if (stage === "locating_browser") {
    return Math.round((1 / totalSteps) * 100);
  }
  const offset = ITERATION_STAGE_OFFSET[stage] ?? 0;
  const clampedRun = Math.max(0, Math.min(runIndex ?? 0, runs - 1));
  const step = 2 + clampedRun * 3 + offset;
  return Math.round((step / totalSteps) * 100);
}

/**
 * Human-readable stage labels rendered in live Audit Job progress trackers.
 */
export const PROGRESS_STAGE_LABELS: Record<LighthouseProgressStage, string> = {
  locating_browser: "Locate Browser",
  launching_browser: "Launch Headless Chrome",
  navigating: "Navigate Target URL",
  analyzing: "Collect Traces & Scores",
  generating_report: "Generate Report Artifact",
  complete: "Complete",
};

interface CwvThresholdSpec {
  goodMax: number;
  poorMin: number;
  scaleMax: number;
  isUnitless?: boolean;
}

const CWV_THRESHOLDS: Record<CwvMetricKey, CwvThresholdSpec> = {
  lcpMs: { goodMax: 2500, poorMin: 4000, scaleMax: 6000 },
  cls: { goodMax: 0.1, poorMin: 0.25, scaleMax: 0.5, isUnitless: true },
  tbtMs: { goodMax: 200, poorMin: 600, scaleMax: 1000 },
  fcpMs: { goodMax: 1800, poorMin: 3000, scaleMax: 4500 },
  siMs: { goodMax: 3400, poorMin: 5800, scaleMax: 8000 },
  ttfbMs: { goodMax: 800, poorMin: 1800, scaleMax: 2500 },
};

/**
 * Maps a `0-100` Lighthouse category score to a semantic {@link RadialGaugeTone}.
 */
export function getScoreTone(score: number | null): RadialGaugeTone {
  if (score === null) {
    return "neutral";
  }
  if (score >= 90) {
    return "success";
  }
  if (score >= 50) {
    return "warning";
  }
  return "destructive";
}

/**
 * Classifies a Core Web Vital measurement against standard Lighthouse thresholds.
 */
export function getCwvRating(
  metric: CwvMetricKey,
  value: number | null,
): CwvRating {
  if (value === null) {
    return "unknown";
  }
  const spec = CWV_THRESHOLDS[metric];
  if (value <= spec.goodMax) {
    return "good";
  }
  if (value <= spec.poorMin) {
    return "needs-improvement";
  }
  return "poor";
}

const CWV_TONE_BY_RATING: Record<CwvRating, RadialGaugeTone> = {
  good: "success",
  "needs-improvement": "warning",
  poor: "destructive",
  unknown: "neutral",
};

/**
 * Maps a {@link CwvRating} to a semantic badge/gauge tone.
 */
export function getCwvTone(rating: CwvRating): RadialGaugeTone {
  return CWV_TONE_BY_RATING[rating];
}

/**
 * Computes a normalized `0-100` horizontal marker position along the CWV segmented threshold bar.
 */
export function getCwvBarPositionPercent(
  metric: CwvMetricKey,
  value: number | null,
): number {
  if (value === null) {
    return 0;
  }
  const spec = CWV_THRESHOLDS[metric];
  if (value <= spec.goodMax) {
    return Math.max(4, Math.min(48, (value / spec.goodMax) * 50));
  }
  if (value <= spec.poorMin) {
    const ratio = (value - spec.goodMax) / (spec.poorMin - spec.goodMax);
    return 50 + ratio * 25;
  }
  const tailRatio = Math.min(
    1,
    (value - spec.poorMin) /
      Math.max(spec.poorMin, spec.scaleMax - spec.poorMin),
  );
  return Math.min(96, 75 + tailRatio * 21);
}

/**
 * Formats a Core Web Vital numeric value cleanly (`ms`, `s`, or unitless CLS).
 */
export function formatCwvValue(
  metric: CwvMetricKey,
  value: number | null,
): string {
  if (value === null) {
    return "N/A";
  }
  if (CWV_THRESHOLDS[metric].isUnitless) {
    return value.toFixed(3);
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} s`;
  }
  return `${Math.round(value)} ms`;
}

/**
 * Formats elapsed wall-clock audit duration concisely.
 */
export function formatDurationMs(durationMs: number): string {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  return `${Math.round(durationMs)}ms`;
}

const TIMESTAMP_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const SHORT_TIMESTAMP_OPTIONS: Intl.DateTimeFormatOptions = {
  ...TIMESTAMP_OPTIONS,
  hour12: false,
};

function formatIsoDate(
  isoString: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return isoString;
  }
  return parsed.toLocaleString("en-US", options);
}

/**
 * Formats an ISO timestamp for audit lists and detail headers.
 */
export function formatTimestamp(isoString: string): string {
  return formatIsoDate(isoString, TIMESTAMP_OPTIONS);
}

/**
 * Formats a compact chart axis timestamp from an ISO string.
 */
export function formatShortTimestamp(isoString: string): string {
  return formatIsoDate(isoString, SHORT_TIMESTAMP_OPTIONS);
}

/**
 * Shortens a full HTTP(S) URL to host + path for compact table and chart labels.
 */
export function shortUrlLabel(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return rawUrl;
  }
}

/**
 * Truncates long run/job IDs to a compact monospace prefix.
 */
export function shortRunId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Matches backend failing-insight semantics (`score < 0.9` or `max metric savings > 50ms`).
 */
export function isFailingInsight(insight: LighthouseInsightItem): boolean {
  const maxMetricSavings = Object.values(insight.metricSavings).reduce(
    (max, value) => Math.max(max, value),
    0,
  );
  return (
    (insight.score !== null && insight.score < 0.9) || maxMetricSavings > 50
  );
}

/**
 * Computes `target - baseline` numeric delta rounded to 3 decimals, or `null` when missing.
 */
export function computeDelta(
  targetValue: number | null,
  baselineValue: number | null,
): number | null {
  if (targetValue === null || baselineValue === null) {
    return null;
  }
  return Number((targetValue - baselineValue).toFixed(3));
}

/**
 * Extracts distinct audited URLs sorted by most recent appearance with occurrence counts.
 */
export function extractDistinctUrls(
  runs: readonly LighthouseRunListItem[],
): readonly { url: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const run of runs) {
    counts.set(run.url, (counts.get(run.url) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([url, count]) => ({
    url,
    label: shortUrlLabel(url),
    count,
  }));
}

/**
 * Sorts Audit Runs chronologically from oldest to newest.
 */
export function sortChronologicalRuns<T extends { createdAt: string }>(
  runs: readonly T[],
): T[] {
  return runs.toSorted(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/**
 * Auto-selects default comparison runs from the latest run's URL, pinning the oldest run as baseline.
 */
export function selectDefaultCompareSelection(
  runs: readonly LighthouseRunListItem[],
): { runIds: string[]; baselineId: string | null } {
  const newestRun = runs[0];
  if (!newestRun) {
    return { runIds: [], baselineId: null };
  }
  const sameUrlChrono = sortChronologicalRuns(
    runs.filter((run) => run.url === newestRun.url),
  );
  const selected =
    sameUrlChrono.length >= 2
      ? sameUrlChrono
      : sortChronologicalRuns(runs.slice(0, Math.min(runs.length, 4)));
  return {
    runIds: selected.map((run) => run.id),
    baselineId: selected[0]?.id ?? null,
  };
}

/**
 * Builds the static-export URL for the Lighthouse History page.
 */
export function buildHistoryUrl(): string {
  return "/lighthouse";
}

/**
 * Builds the static-export URL for the Lighthouse Compare page with optional query params.
 */
export function buildCompareUrl(options?: {
  runIds?: readonly string[];
  baselineId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (options?.runIds && options.runIds.length > 0) {
    params.set("runs", options.runIds.join(","));
  }
  if (options?.baselineId) {
    params.set("baseline", options.baselineId);
  }
  const qs = params.toString();
  return qs ? `/lighthouse/compare?${qs}` : "/lighthouse/compare";
}

/**
 * Builds the static-export query URL for an Audit Run detail page.
 */
export function buildRunDetailUrl(
  runId: string,
  tab: "summary" | "report" = "summary",
): string {
  const params = new URLSearchParams({ id: runId });
  if (tab === "report") {
    params.set("tab", "report");
  }
  return `/lighthouse/run?${params.toString()}`;
}

/**
 * Builds the static-export query URL for a live Audit Job progress stream page.
 */
export function buildActiveJobUrl(jobId: string): string {
  const params = new URLSearchParams({ job: jobId });
  return `/lighthouse/run?${params.toString()}`;
}
