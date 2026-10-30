import {
  LighthouseRunSummaryDataSchema,
  type AttributedElement,
  type ClsCulprit,
  type ClsCulpritCause,
  type ElementBoundingRect,
  type LcpPhaseBreakdown,
  type LighthouseCategoryScores,
  type LighthouseCoreWebVitals,
  type LighthouseFailedAudit,
  type LighthouseInsightItem,
  type LighthouseMedianMetadata,
  type NormalizedLighthouseRun,
  type RawLhrAuditItem,
  type RawLighthouseResult,
} from "./types";

const IGNORED_DISPLAY_MODES = new Set([
  "notApplicable",
  "informative",
  "manual",
]);

const METRIC_AUDIT_IDS = new Set([
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "speed-index",
  "interactive",
  "max-potential-fid",
  "interaction-to-next-paint",
  "server-response-time",
  "metrics",
]);

/**
 * Converts a Lighthouse `[0, 1]` category score into a rounded `0-100` integer, preserving `null`.
 */
function toPercentageScore(rawScore: number | null | undefined): number | null {
  if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) {
    return null;
  }
  return Math.round(rawScore * 100);
}

/**
 * Extracts a finite numeric value from an audit item, returning `null` if unavailable or errored.
 */
function toFiniteMetric(audit: RawLhrAuditItem | undefined): number | null {
  if (!audit || audit.scoreDisplayMode === "error") {
    return null;
  }
  const value = audit.numericValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Resolves Time to First Byte (TTFB) in milliseconds using the 3-source fallback chain in Lighthouse v13.5.0:
 * 1. `lhr.audits['server-response-time']?.numericValue`
 * 2. `lhr.audits['document-latency-insight']?.details?.debugData?.serverResponseTime`
 * 3. `lhr.audits['metrics']?.details?.items?.[0]?.timeToFirstByte`
 */
function extractTtfbMs(
  audits: Record<string, RawLhrAuditItem | undefined>,
): number | null {
  const fromServerResponse = toFiniteMetric(audits["server-response-time"]);
  if (fromServerResponse !== null) {
    return fromServerResponse;
  }

  const docLatencyDetails = audits["document-latency-insight"]?.details;
  const debugData = docLatencyDetails?.debugData as
    Record<string, unknown> | undefined;
  const debugTtfb = debugData?.serverResponseTime;
  if (typeof debugTtfb === "number" && Number.isFinite(debugTtfb)) {
    return debugTtfb;
  }

  const metricsDetails = audits["metrics"]?.details;
  const metricsItems = metricsDetails?.items as
    Array<Record<string, unknown>> | undefined;
  const metricsTtfb = metricsItems?.[0]?.timeToFirstByte;
  if (typeof metricsTtfb === "number" && Number.isFinite(metricsTtfb)) {
    return metricsTtfb;
  }

  return null;
}

/**
 * Parses a raw `boundingRect` object into an {@link ElementBoundingRect} if all 6 coordinates are finite numbers.
 */
function parseBoundingRect(raw: unknown): ElementBoundingRect | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const rect = raw as Record<string, unknown>;
  const top = rect.top;
  const bottom = rect.bottom;
  const left = rect.left;
  const right = rect.right;
  const width = rect.width;
  const height = rect.height;
  if (
    typeof top === "number" &&
    typeof bottom === "number" &&
    typeof left === "number" &&
    typeof right === "number" &&
    typeof width === "number" &&
    typeof height === "number"
  ) {
    return { top, bottom, left, right, width, height };
  }
  return null;
}

/**
 * Parses a Lighthouse `Details.NodeValue` (`{ type: 'node', selector, ... }`) into an {@link AttributedElement}.
 */
function parseNodeValue(raw: unknown): AttributedElement | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const node = raw as Record<string, unknown>;
  if (node.type !== "node" || typeof node.selector !== "string") {
    return null;
  }
  return {
    selector: node.selector,
    snippet: typeof node.snippet === "string" ? node.snippet : null,
    nodeLabel: typeof node.nodeLabel === "string" ? node.nodeLabel : null,
    path: typeof node.path === "string" ? node.path : null,
    lhId: typeof node.lhId === "string" ? node.lhId : null,
    boundingRect: parseBoundingRect(node.boundingRect),
  };
}

/**
 * Extracts the 4 LCP phase durations from the `lcp-breakdown-insight` subparts table.
 */
function extractLcpPhasesFromTable(
  rawTable: unknown,
): LcpPhaseBreakdown | null {
  if (!rawTable || typeof rawTable !== "object") {
    return null;
  }
  const table = rawTable as Record<string, unknown>;
  if (table.type !== "table" || !Array.isArray(table.items)) return null;

  const phases: LcpPhaseBreakdown = {
    timeToFirstByteMs: null,
    resourceLoadDelayMs: null,
    resourceLoadDurationMs: null,
    elementRenderDelayMs: null,
  };
  let foundAny = false;

  for (const item of table.items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const subpart = row.subpart;
    const duration = row.duration;
    if (typeof duration !== "number" || !Number.isFinite(duration)) continue;

    if (subpart === "timeToFirstByte") {
      phases.timeToFirstByteMs = duration;
      foundAny = true;
    } else if (subpart === "resourceLoadDelay") {
      phases.resourceLoadDelayMs = duration;
      foundAny = true;
    } else if (subpart === "resourceLoadDuration") {
      phases.resourceLoadDurationMs = duration;
      foundAny = true;
    } else if (subpart === "elementRenderDelay") {
      phases.elementRenderDelayMs = duration;
      foundAny = true;
    }
  }

  return foundAny ? phases : null;
}

/**
 * Searches a `details.items` array for a direct `NodeValue` or a table row containing `{ node: NodeValue }`.
 */
function findNodeInDetailsItems(items: unknown[]): AttributedElement | null {
  for (const item of items) {
    const directNode = parseNodeValue(item);
    if (directNode) {
      return directNode;
    }
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      const nestedNode = parseNodeValue(row.node);
      if (nestedNode) {
        return nestedNode;
      }
    }
  }
  return null;
}

/**
 * Extracts the LCP `AttributedElement` and 4 phase subparts from `lcp-breakdown-insight`,
 * falling back to `lcp-discovery-insight` and legacy `largest-contentful-paint-element`.
 */
function extractLcpAttribution(
  audits: Record<string, RawLhrAuditItem | undefined>,
): {
  lcpElement: AttributedElement | null;
  lcpPhases: LcpPhaseBreakdown | null;
} {
  let lcpElement: AttributedElement | null = null;
  let lcpPhases: LcpPhaseBreakdown | null = null;

  const breakdownItems = audits["lcp-breakdown-insight"]?.details?.items;
  if (Array.isArray(breakdownItems)) {
    lcpPhases = extractLcpPhasesFromTable(breakdownItems[0]);
    lcpElement = findNodeInDetailsItems(breakdownItems);
  }

  if (!lcpElement) {
    const discoveryItems = audits["lcp-discovery-insight"]?.details?.items;
    if (Array.isArray(discoveryItems)) {
      lcpElement = findNodeInDetailsItems(discoveryItems);
    }
  }

  if (!lcpElement) {
    const legacyItems =
      audits["largest-contentful-paint-element"]?.details?.items;
    if (Array.isArray(legacyItems)) {
      lcpElement = findNodeInDetailsItems(legacyItems);
    }
  }

  return { lcpElement, lcpPhases };
}

/**
 * Parses root-cause `subItems` attached to a CLS culprit row in `cls-culprits-insight`.
 */
function parseClsSubItems(rawSubItems: unknown): ClsCulpritCause[] {
  if (!rawSubItems || typeof rawSubItems !== "object") {
    return [];
  }
  const sub = rawSubItems as Record<string, unknown>;
  if (!Array.isArray(sub.items)) {
    return [];
  }

  const causes: ClsCulpritCause[] = [];
  for (const rawItem of sub.items) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    const cause = typeof item.cause === "string" ? item.cause : null;
    if (!cause) continue;

    const extra = item.extra as Record<string, unknown> | undefined;
    const url =
      extra?.type === "url" && typeof extra.value === "string"
        ? extra.value
        : null;
    const selector =
      extra?.type === "node" && typeof extra.selector === "string"
        ? extra.selector
        : null;

    causes.push({ cause, url, selector });
  }
  return causes;
}

/**
 * Extracts CLS culprit rows from a single table's `items`, skipping summary rows where `node.type === 'text'`.
 */
function extractCulpritsFromTableItems(tableItems: unknown[]): ClsCulprit[] {
  const culprits: ClsCulprit[] = [];
  for (const rawRow of tableItems) {
    if (!rawRow || typeof rawRow !== "object") continue;
    const row = rawRow as Record<string, unknown>;
    const element = parseNodeValue(row.node);
    if (!element) {
      continue;
    }
    const score =
      typeof row.score === "number" && Number.isFinite(row.score)
        ? row.score
        : 0;
    culprits.push({
      element,
      score,
      causes: parseClsSubItems(row.subItems),
    });
  }
  return culprits;
}

/**
 * Extracts CLS culprits from `cls-culprits-insight` (filtering out Row 0 `node.type === 'text'` cluster headers),
 * with fallback to the hidden `layout-shifts` table.
 */
function extractClsCulprits(
  audits: Record<string, RawLhrAuditItem | undefined>,
): ClsCulprit[] {
  const insightDetails = audits["cls-culprits-insight"]?.details;
  if (insightDetails && Array.isArray(insightDetails.items)) {
    const culprits: ClsCulprit[] = [];
    for (const clusterTable of insightDetails.items) {
      if (!clusterTable || typeof clusterTable !== "object") continue;
      const table = clusterTable as Record<string, unknown>;
      if (Array.isArray(table.items)) {
        culprits.push(...extractCulpritsFromTableItems(table.items));
      }
    }
    if (culprits.length > 0) {
      return culprits;
    }
  }

  const fallbackDetails = audits["layout-shifts"]?.details;
  if (fallbackDetails && Array.isArray(fallbackDetails.items)) {
    return extractCulpritsFromTableItems(fallbackDetails.items);
  }

  return [];
}

/**
 * Computes total numeric metric savings across all metrics on an insight audit for sorting priority.
 */
function computeTotalMetricSavings(savings: Record<string, number>): number {
  let sum = 0;
  for (const val of Object.values(savings)) {
    if (typeof val === "number" && Number.isFinite(val) && val > 0) {
      sum += val;
    }
  }
  return sum;
}

/**
 * Extracts and prioritizes Lighthouse v13 `*-insight` audits.
 */
function extractInsights(
  audits: Record<string, RawLhrAuditItem | undefined>,
): LighthouseInsightItem[] {
  const insights: LighthouseInsightItem[] = [];

  for (const [key, audit] of Object.entries(audits)) {
    const id = audit?.id ?? key;
    if (!audit || !id.endsWith("-insight")) continue;

    const mode = audit.scoreDisplayMode ?? "informative";
    if (mode === "notApplicable") continue;

    const cleanSavings: Record<string, number> = {};
    if (audit.metricSavings && typeof audit.metricSavings === "object") {
      for (const [metric, val] of Object.entries(audit.metricSavings)) {
        if (typeof val === "number" && Number.isFinite(val)) {
          cleanSavings[metric] = val;
        }
      }
    }

    insights.push({
      id,
      title: audit.title ?? id,
      description: audit.description ?? "",
      score:
        typeof audit.score === "number" && Number.isFinite(audit.score)
          ? audit.score
          : null,
      scoreDisplayMode: mode,
      displayValue:
        typeof audit.displayValue === "string" ? audit.displayValue : null,
      metricSavings: cleanSavings,
      replacesAudits: Array.isArray(audit.replacesAudits)
        ? audit.replacesAudits.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    });
  }

  return insights.toSorted((a, b) => {
    const aFailed = a.score !== null && a.score < 1 ? 0 : 1;
    const bFailed = b.score !== null && b.score < 1 ? 0 : 1;
    if (aFailed !== bFailed) {
      return aFailed - bFailed;
    }
    const savingsDiff =
      computeTotalMetricSavings(b.metricSavings) -
      computeTotalMetricSavings(a.metricSavings);
    if (savingsDiff !== 0) {
      return savingsDiff;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Builds a map of `auditId -> categoryId` from `lhr.categories`.
 */
function buildAuditCategoryMap(
  categories: RawLighthouseResult["categories"],
): Map<string, string> {
  const map = new Map<string, string>();
  if (!categories) return map;

  for (const [catKey, cat] of Object.entries(categories)) {
    const categoryId = cat?.id ?? catKey;
    for (const ref of cat?.auditRefs ?? []) {
      if (ref.id && !map.has(ref.id)) {
        map.set(ref.id, categoryId);
      }
    }
  }
  return map;
}

/**
 * Extracts non-insight failed or warning audits (`score < 0.9` or `scoreDisplayMode === 'error'`).
 */
function extractFailedAudits(
  lhr: RawLighthouseResult,
  audits: Record<string, RawLhrAuditItem | undefined>,
): LighthouseFailedAudit[] {
  const categoryMap = buildAuditCategoryMap(lhr.categories);
  const failed: LighthouseFailedAudit[] = [];

  for (const [key, audit] of Object.entries(audits)) {
    const id = audit?.id ?? key;
    if (!audit || id.endsWith("-insight") || METRIC_AUDIT_IDS.has(id)) {
      continue;
    }

    const mode = audit.scoreDisplayMode ?? "binary";
    if (IGNORED_DISPLAY_MODES.has(mode)) {
      continue;
    }

    const score =
      typeof audit.score === "number" && Number.isFinite(audit.score)
        ? audit.score
        : null;
    const isError = mode === "error";
    const isFailingScore = score !== null && score < 0.9;

    if (!isError && !isFailingScore) {
      continue;
    }

    failed.push({
      id,
      title: audit.title ?? id,
      description: audit.description ?? "",
      category: categoryMap.get(id) ?? null,
      score,
      scoreDisplayMode: mode,
      displayValue:
        typeof audit.displayValue === "string" ? audit.displayValue : null,
    });
  }

  return failed.toSorted((a, b) => (a.score ?? 0) - (b.score ?? 0));
}

/**
 * Normalizes a raw Lighthouse v13 Result (`LHR`) into hot category scores, Core Web Vitals,
 * and a validated warm `LighthouseRunSummaryData` payload.
 *
 * @remarks
 * Executes a 5-stage transformation pipeline:
 * 1. Category scores: transforms `[0, 1]` floats into rounded `0-100` integers.
 * 2. Core Web Vitals: extracts LCP, CLS, TBT, FCP, SI, and resolves TTFB via a 3-source fallback chain.
 * 3. Element attributions: extracts LCP element bounding rects and 4-phase duration breakdown,
 *    and maps CLS culprits with root-cause attribution from `cls-culprits-insight`.
 * 4. Diagnostics: prioritizes Lighthouse v13 `*-insight` audits by failure and metric savings,
 *    and collects non-insight failing audits.
 * 5. Schema validation: validates the aggregated warm payload against {@link LighthouseRunSummaryDataSchema},
 *    integrating optional multi-run median distribution metadata.
 *
 * @param lhr - Raw Lighthouse v13 Result object.
 * @param medianMetadata - Optional multi-run distribution metadata when `--runs > 1`.
 * @returns Normalized scores, Core Web Vitals, and warm summary JSON.
 */
export function normalizeLhr(
  lhr: RawLighthouseResult,
  medianMetadata: LighthouseMedianMetadata | null = null,
): NormalizedLighthouseRun {
  const categories = lhr.categories ?? {};
  const audits = lhr.audits ?? {};

  const scores: LighthouseCategoryScores = {
    performanceScore: toPercentageScore(categories.performance?.score),
    accessibilityScore: toPercentageScore(categories.accessibility?.score),
    bestPracticesScore: toPercentageScore(categories["best-practices"]?.score),
    seoScore: toPercentageScore(categories.seo?.score),
  };

  const metrics: LighthouseCoreWebVitals = {
    lcpMs: toFiniteMetric(audits["largest-contentful-paint"]),
    cls: toFiniteMetric(audits["cumulative-layout-shift"]),
    tbtMs: toFiniteMetric(audits["total-blocking-time"]),
    fcpMs: toFiniteMetric(audits["first-contentful-paint"]),
    siMs: toFiniteMetric(audits["speed-index"]),
    ttfbMs: extractTtfbMs(audits),
  };

  const { lcpElement, lcpPhases } = extractLcpAttribution(audits);
  const clsCulprits = extractClsCulprits(audits);
  const insights = extractInsights(audits);
  const failedAudits = extractFailedAudits(lhr, audits);

  const rawRuntimeError = lhr.runtimeError;
  const runtimeError =
    rawRuntimeError &&
    typeof rawRuntimeError.code === "string" &&
    rawRuntimeError.code !== "NO_ERROR"
      ? {
          code: rawRuntimeError.code,
          message:
            typeof rawRuntimeError.message === "string"
              ? rawRuntimeError.message
              : "",
        }
      : null;

  const summary = LighthouseRunSummaryDataSchema.parse({
    lcpElement,
    lcpPhases,
    clsCulprits,
    insights,
    failedAudits,
    runWarnings: Array.isArray(lhr.runWarnings)
      ? lhr.runWarnings.filter((w): w is string => typeof w === "string")
      : [],
    runtimeError,
    medianMetadata,
  });

  const requestedUrl =
    lhr.requestedUrl ?? lhr.finalDisplayedUrl ?? lhr.finalUrl ?? "";
  const finalUrl = lhr.finalDisplayedUrl ?? lhr.finalUrl ?? requestedUrl;

  return {
    requestedUrl,
    finalUrl,
    scores,
    metrics,
    summary,
  };
}
