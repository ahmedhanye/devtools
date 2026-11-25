import type {
  LighthouseFormFactor,
  LighthouseRunListItem,
} from "@devtools/lighthouse/schemas";
import {
  selectDefaultCompareSelection,
  sortChronologicalRuns,
} from "@/entities/lighthouse-run";

export type CompareDeviceRule = "all" | LighthouseFormFactor;

export type CompareSortKey =
  | "createdAt"
  | "performanceScore"
  | "accessibilityScore"
  | "bestPracticesScore"
  | "seoScore"
  | "lcpMs"
  | "cls"
  | "tbtMs";

export type CompareSortDir = "asc" | "desc";

/**
 * Parses comma-separated run IDs from the `?runs=` query parameter while preserving unique order.
 */
export function parseCompareRunsParam(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Resolves the effective comparison run IDs and baseline ID from URL params and available runs.
 */
export function resolveEffectiveCompareSelection(params: {
  runsParam: string | null;
  baselineParam: string | null;
  availableRuns: readonly LighthouseRunListItem[];
}): { runIds: string[]; baselineId: string | null; isExplicit: boolean } {
  if (params.runsParam !== null) {
    const explicitIds = parseCompareRunsParam(params.runsParam);
    const baselineId =
      params.baselineParam && explicitIds.includes(params.baselineParam)
        ? params.baselineParam
        : (explicitIds[0] ?? null);
    return { runIds: explicitIds, baselineId, isExplicit: true };
  }

  const defaults = selectDefaultCompareSelection(params.availableRuns);
  const baselineId =
    params.baselineParam && defaults.runIds.includes(params.baselineParam)
      ? params.baselineParam
      : defaults.baselineId;
  return {
    runIds: defaults.runIds,
    baselineId,
    isExplicit: false,
  };
}

/**
 * Returns chronological runs matching `selectedIds` (and optional device filter) sorted oldest-first.
 */
export function getChronologicalSelectedRuns(
  runsById: ReadonlyMap<string, LighthouseRunListItem>,
  selectedIds: readonly string[],
  deviceRule: CompareDeviceRule,
): LighthouseRunListItem[] {
  const result: LighthouseRunListItem[] = [];
  for (const id of selectedIds) {
    const run = runsById.get(id);
    if (!run) {
      continue;
    }
    if (deviceRule !== "all" && run.formFactor !== deviceRule) {
      continue;
    }
    result.push(run);
  }
  return sortChronologicalRuns(result);
}

/**
 * Sorts comparison runs for the Comparison Matrix table while keeping missing metrics last.
 */
export function sortCompareRuns(
  runs: readonly LighthouseRunListItem[],
  sortKey: CompareSortKey,
  sortDir: CompareSortDir,
): LighthouseRunListItem[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return runs.toSorted((a, b) => {
    if (sortKey === "createdAt") {
      return (
        (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
        dir
      );
    }
    const va = a[sortKey];
    const vb = b[sortKey];
    if (va === null && vb === null) {
      return 0;
    }
    if (va === null) {
      return 1;
    }
    if (vb === null) {
      return -1;
    }
    return (va - vb) * dir;
  });
}

/**
 * Selects the newest run per distinct audited URL matching optional device rules.
 */
export function selectLatestRunPerUrl(
  availableRuns: readonly LighthouseRunListItem[],
  deviceRule: CompareDeviceRule,
): { runIds: string[]; baselineId: string | null } {
  const latestByUrl = new Map<string, LighthouseRunListItem>();
  for (const run of availableRuns) {
    if (deviceRule !== "all" && run.formFactor !== deviceRule) {
      continue;
    }
    if (!latestByUrl.has(run.url)) {
      latestByUrl.set(run.url, run);
    }
  }
  const chrono = sortChronologicalRuns(Array.from(latestByUrl.values()));
  return {
    runIds: chrono.map((run) => run.id),
    baselineId: chrono[0]?.id ?? null,
  };
}

/**
 * Selects all runs matching a set of URLs and device rule, pinning the oldest as baseline.
 */
export function selectRunsForUrls(
  availableRuns: readonly LighthouseRunListItem[],
  urls: readonly string[],
  deviceRule: CompareDeviceRule,
): { runIds: string[]; baselineId: string | null } {
  const urlSet = new Set(urls);
  const matching = sortChronologicalRuns(
    availableRuns.filter(
      (run) =>
        urlSet.has(run.url) &&
        (deviceRule === "all" || run.formFactor === deviceRule),
    ),
  );
  return {
    runIds: matching.map((run) => run.id),
    baselineId: matching[0]?.id ?? null,
  };
}

/**
 * Extracts a target run ID from a Recharts bar click event payload, if present.
 */
export function extractBarClickRunId(barData: unknown): string | null {
  if (
    typeof barData === "object" &&
    barData !== null &&
    "payload" in barData &&
    typeof barData.payload === "object" &&
    barData.payload !== null &&
    "runId" in barData.payload &&
    typeof barData.payload.runId === "string"
  ) {
    return barData.payload.runId;
  }
  return null;
}

function parseTooltipIndex(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isInteger(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }
  return null;
}

/**
 * Extracts a target run ID from a Recharts area chart click state using the indexed data array.
 */
export function extractAreaClickRunId(
  chartState: unknown,
  chartData: readonly { runId: string }[],
): string | null {
  if (
    typeof chartState !== "object" ||
    chartState === null ||
    !("activeTooltipIndex" in chartState)
  ) {
    return null;
  }
  const index = parseTooltipIndex(chartState.activeTooltipIndex);
  if (index === null) {
    return null;
  }
  return chartData[index]?.runId ?? null;
}

/**
 * Builds click handler callbacks that route Recharts Bar and Area click payloads to `onInspectRun`.
 */
export function buildChartInspectHandlers(
  chartData: readonly { runId: string }[],
  onInspectRun: (runId: string) => void,
) {
  return {
    onBarClick: (barData: unknown) => {
      const targetId = extractBarClickRunId(barData);
      if (targetId) {
        onInspectRun(targetId);
      }
    },
    onAreaChartClick: (chartState: unknown) => {
      const targetId = extractAreaClickRunId(chartState, chartData);
      if (targetId) {
        onInspectRun(targetId);
      }
    },
  };
}
