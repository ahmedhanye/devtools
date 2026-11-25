"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  LighthouseFormFactorSchema,
  type LighthouseRunListItem,
} from "@devtools/lighthouse/schemas";
import {
  extractDistinctUrls,
  lighthouseQueries,
} from "@/entities/lighthouse-run";
import { updateNativeSearchParams, useNativeSearchParams } from "@/shared/lib";
import type { MultiSelectOption } from "@/shared/ui";
import {
  type CompareDeviceRule,
  type CompareSortDir,
  type CompareSortKey,
  getChronologicalSelectedRuns,
  parseCompareRunsParam,
  resolveEffectiveCompareSelection,
  selectLatestRunPerUrl,
  selectRunsForUrls,
  sortCompareRuns,
} from "./compare-helpers";

export interface CompareBuilderModel {
  chronoRuns: readonly LighthouseRunListItem[];
  baselineId: string | null;
  topPresetUrls: readonly { url: string; label: string; count: number }[];
  distinctUrlsCount: number;
  totalAvailableCount: number;
  totalStoredCount: number;
  urlComboboxOptions: readonly MultiSelectOption[];
  selectedUrls: readonly string[];
  deviceRule: CompareDeviceRule;
  unaddedRuns: readonly LighthouseRunListItem[];
  onPresetUrl: (url: string) => void;
  onPresetLatestPerUrl: () => void;
  onPresetAllRuns: () => void;
  onUrlsChange: (nextUrls: string[]) => void;
  onDeviceRuleChange: (value: string | null) => void;
  onAddSpecificRun: (runId: string) => void;
  onSetBaseline: (runId: string) => void;
  onRemoveRun: (runId: string) => void;
}

function syncCompareSearchParams(
  nextIds: readonly string[],
  nextBaselineId: string | null,
) {
  const validBaseline =
    nextBaselineId && nextIds.includes(nextBaselineId)
      ? nextBaselineId
      : (nextIds[0] ?? null);
  updateNativeSearchParams(
    (params) => {
      params.set("runs", nextIds.join(","));
      if (validBaseline) {
        params.set("baseline", validBaseline);
      } else {
        params.delete("baseline");
      }
    },
    { replace: true },
  );
}

function buildCompareRunsMap(
  availableRuns: readonly LighthouseRunListItem[],
  missingRunQueries: readonly { data?: LighthouseRunListItem }[],
): Map<string, LighthouseRunListItem> {
  const map = new Map<string, LighthouseRunListItem>();
  for (const run of availableRuns) {
    map.set(run.id, run);
  }
  for (const query of missingRunQueries) {
    if (query.data) {
      map.set(query.data.id, query.data);
    }
  }
  return map;
}

function buildMissingDetailQueryOptions(
  explicitRunIds: readonly string[],
  availableRuns: readonly LighthouseRunListItem[],
  skip: boolean,
): {
  missingIds: string[];
  queries: ReturnType<typeof lighthouseQueries.detail>[];
} {
  if (skip) {
    return { missingIds: [], queries: [] };
  }
  const availableIds = new Set(availableRuns.map((run) => run.id));
  const missingIds = explicitRunIds.filter((id) => !availableIds.has(id));
  return {
    missingIds,
    queries: missingIds.map((id) => lighthouseQueries.detail(id)),
  };
}

interface FailedMissingRun {
  runId: string;
  message: string;
}

function summarizeMissingQueries(
  missingIds: readonly string[],
  missingRunQueries: readonly {
    isPending: boolean;
    error: Error | null;
    refetch: () => Promise<unknown>;
  }[],
) {
  const failedMissingRuns: FailedMissingRun[] = [];
  const refetchByRunId = new Map<string, () => Promise<unknown>>();
  for (const [idx, query] of missingRunQueries.entries()) {
    const runId = missingIds[idx];
    if (runId && query.error) {
      failedMissingRuns.push({
        runId,
        message: query.error.message,
      });
      refetchByRunId.set(runId, query.refetch);
    }
  }
  return {
    isMissingRunsPending: missingRunQueries.some((query) => query.isPending),
    failedMissingRuns,
    refetchByRunId,
  };
}

function useCompareRunQueries(runsParam: string | null) {
  const {
    data: listData,
    isPending: isListPending,
    error: listError,
    refetch: refetchList,
  } = useQuery(lighthouseQueries.recentUrls());

  const availableRuns = useMemo(() => listData?.runs ?? [], [listData?.runs]);
  const totalStoredCount = listData?.total ?? availableRuns.length;
  const explicitRunIds = useMemo(
    () => parseCompareRunsParam(runsParam),
    [runsParam],
  );

  const missingDetailSpec = useMemo(
    () =>
      buildMissingDetailQueryOptions(
        explicitRunIds,
        availableRuns,
        isListPending || listError !== null,
      ),
    [availableRuns, explicitRunIds, isListPending, listError],
  );

  const missingRunQueries = useQueries({
    queries: missingDetailSpec.queries,
  });

  const runsById = useMemo(
    () => buildCompareRunsMap(availableRuns, missingRunQueries),
    [availableRuns, missingRunQueries],
  );

  const { isMissingRunsPending, failedMissingRuns, refetchByRunId } =
    summarizeMissingQueries(missingDetailSpec.missingIds, missingRunQueries);

  const handleRetryList = useCallback(() => {
    void refetchList();
  }, [refetchList]);

  const handleRetryMissingRun = useCallback(
    (runId: string) => {
      const refetch = refetchByRunId.get(runId);
      if (refetch) {
        void refetch();
      }
    },
    [refetchByRunId],
  );

  return {
    availableRuns,
    totalStoredCount,
    runsById,
    isListPending: isListPending || isMissingRunsPending,
    listErrorMessage: listError?.message ?? null,
    failedMissingRuns,
    hasAnyRuns: availableRuns.length > 0 || runsById.size > 0,
    handleRetryList,
    handleRetryMissingRun,
  };
}

function useCompareDerivedSelection({
  runsParam,
  baselineParam,
  availableRuns,
  runsById,
  deviceRule,
  sortKey,
  sortDir,
  focusedDiffRunId,
}: {
  runsParam: string | null;
  baselineParam: string | null;
  availableRuns: readonly LighthouseRunListItem[];
  runsById: ReadonlyMap<string, LighthouseRunListItem>;
  deviceRule: CompareDeviceRule;
  sortKey: CompareSortKey;
  sortDir: CompareSortDir;
  focusedDiffRunId: string | null;
}) {
  const effectiveSelection = useMemo(
    () =>
      resolveEffectiveCompareSelection({
        runsParam,
        baselineParam,
        availableRuns,
      }),
    [availableRuns, baselineParam, runsParam],
  );

  const chronoRuns = useMemo(
    () =>
      getChronologicalSelectedRuns(
        runsById,
        effectiveSelection.runIds,
        deviceRule,
      ),
    [deviceRule, effectiveSelection.runIds, runsById],
  );

  const baselineRun = useMemo(
    () =>
      chronoRuns.find((run) => run.id === effectiveSelection.baselineId) ??
      chronoRuns[0] ??
      null,
    [chronoRuns, effectiveSelection.baselineId],
  );

  const sortedRuns = useMemo(
    () => sortCompareRuns(chronoRuns, sortKey, sortDir),
    [chronoRuns, sortDir, sortKey],
  );

  const distinctUrls = useMemo(
    () => extractDistinctUrls(availableRuns),
    [availableRuns],
  );

  const urlComboboxOptions = useMemo<MultiSelectOption[]>(
    () =>
      distinctUrls.map((entry) => ({
        value: entry.url,
        label: entry.label,
        count: entry.count,
      })),
    [distinctUrls],
  );

  const selectedUrls = useMemo(
    () => Array.from(new Set(chronoRuns.map((run) => run.url))),
    [chronoRuns],
  );

  const unaddedRuns = useMemo(() => {
    const included = new Set(effectiveSelection.runIds);
    return availableRuns.filter(
      (run) =>
        !included.has(run.id) &&
        (deviceRule === "all" || run.formFactor === deviceRule),
    );
  }, [availableRuns, deviceRule, effectiveSelection.runIds]);

  const baselineRunId = baselineRun?.id ?? null;

  const diffTargetRun = useMemo(() => {
    if (!baselineRunId || sortedRuns.length < 2) {
      return null;
    }
    if (sortedRuns.length === 2) {
      return sortedRuns.find((run) => run.id !== baselineRunId) ?? null;
    }
    if (focusedDiffRunId && focusedDiffRunId !== baselineRunId) {
      return sortedRuns.find((run) => run.id === focusedDiffRunId) ?? null;
    }
    return null;
  }, [baselineRunId, focusedDiffRunId, sortedRuns]);

  const fallbackDiffTargetId = useMemo(
    () => chronoRuns.findLast((run) => run.id !== baselineRunId)?.id ?? null,
    [baselineRunId, chronoRuns],
  );

  return useMemo(
    () => ({
      effectiveRunIds: effectiveSelection.runIds,
      urlBaselineId: effectiveSelection.baselineId,
      chronoRuns,
      baselineRun,
      baselineRunId,
      sortedRuns,
      distinctUrls,
      urlComboboxOptions,
      selectedUrls,
      unaddedRuns,
      diffTargetRun,
      fallbackDiffTargetId,
    }),
    [
      baselineRun,
      baselineRunId,
      chronoRuns,
      diffTargetRun,
      distinctUrls,
      effectiveSelection.baselineId,
      effectiveSelection.runIds,
      fallbackDiffTargetId,
      selectedUrls,
      sortedRuns,
      unaddedRuns,
      urlComboboxOptions,
    ],
  );
}

interface CompareSelectionActionsDeps {
  availableRuns: readonly LighthouseRunListItem[];
  distinctUrls: readonly { url: string }[];
  effectiveRunIds: readonly string[];
  urlBaselineId: string | null;
  baselineRunId: string | null;
  sortedRuns: readonly LighthouseRunListItem[];
  deviceRule: CompareDeviceRule;
  focusedDiffRunId: string | null;
  setDeviceRule: (rule: CompareDeviceRule) => void;
  setFocusedDiffRunId: (runId: string | null) => void;
}

function useCompareSelectionActions(deps: CompareSelectionActionsDeps) {
  const {
    availableRuns,
    distinctUrls,
    effectiveRunIds,
    urlBaselineId,
    baselineRunId,
    sortedRuns,
    deviceRule,
    focusedDiffRunId,
    setDeviceRule,
    setFocusedDiffRunId,
  } = deps;
  const applyUrlSelection = useCallback(
    (urls: readonly string[]) => {
      const next = selectRunsForUrls(availableRuns, urls, deviceRule);
      syncCompareSearchParams(next.runIds, next.baselineId);
    },
    [availableRuns, deviceRule],
  );

  const handlePresetUrl = useCallback(
    (url: string) => applyUrlSelection([url]),
    [applyUrlSelection],
  );

  const handlePresetLatestPerUrl = useCallback(() => {
    const next = selectLatestRunPerUrl(availableRuns, deviceRule);
    syncCompareSearchParams(next.runIds, next.baselineId);
  }, [availableRuns, deviceRule]);

  const handlePresetAllRuns = useCallback(() => {
    applyUrlSelection(distinctUrls.map((entry) => entry.url));
  }, [applyUrlSelection, distinctUrls]);

  const handleDeviceRuleChange = useCallback(
    (value: string | null) => {
      if (value === "all") {
        setDeviceRule("all");
        return;
      }
      const parsed = LighthouseFormFactorSchema.safeParse(value);
      if (parsed.success) {
        setDeviceRule(parsed.data);
      }
    },
    [setDeviceRule],
  );

  const handleAddSpecificRun = useCallback(
    (runId: string) => {
      const nextIds = effectiveRunIds.includes(runId)
        ? effectiveRunIds
        : [...effectiveRunIds, runId];
      syncCompareSearchParams(nextIds, urlBaselineId ?? runId);
    },
    [effectiveRunIds, urlBaselineId],
  );

  const handleSetBaseline = useCallback(
    (runId: string) => syncCompareSearchParams(effectiveRunIds, runId),
    [effectiveRunIds],
  );

  const handleRemoveRun = useCallback(
    (runId: string) => {
      const nextIds = effectiveRunIds.filter((id) => id !== runId);
      const nextBase =
        urlBaselineId === runId ? (nextIds[0] ?? null) : urlBaselineId;
      if (focusedDiffRunId === runId) {
        setFocusedDiffRunId(null);
      }
      syncCompareSearchParams(nextIds, nextBase);
    },
    [effectiveRunIds, focusedDiffRunId, setFocusedDiffRunId, urlBaselineId],
  );

  const handleSwapTwoBaseline = useCallback(() => {
    const other = baselineRunId
      ? sortedRuns.find((run) => run.id !== baselineRunId)
      : undefined;
    if (other) {
      syncCompareSearchParams(effectiveRunIds, other.id);
    }
  }, [baselineRunId, effectiveRunIds, sortedRuns]);

  return useMemo(
    () => ({
      handlePresetUrl,
      handlePresetLatestPerUrl,
      handlePresetAllRuns,
      handleUrlsChange: applyUrlSelection,
      handleDeviceRuleChange,
      handleAddSpecificRun,
      handleSetBaseline,
      handleRemoveRun,
      handleSwapTwoBaseline,
    }),
    [
      applyUrlSelection,
      handleAddSpecificRun,
      handleDeviceRuleChange,
      handlePresetAllRuns,
      handlePresetLatestPerUrl,
      handlePresetUrl,
      handleRemoveRun,
      handleSetBaseline,
      handleSwapTwoBaseline,
    ],
  );
}

/**
 * Manages Compare workspace URL query params, selection presets, sorting, and diff focus.
 */
export function useCompareController() {
  const searchParams = useNativeSearchParams();
  const [deviceRule, setDeviceRule] = useState<CompareDeviceRule>("all");
  const [sortKey, setSortKey] = useState<CompareSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<CompareSortDir>("desc");
  const [focusedDiffRunId, setFocusedDiffRunId] = useState<string | null>(null);

  const queries = useCompareRunQueries(searchParams.get("runs"));
  const derived = useCompareDerivedSelection({
    runsParam: searchParams.get("runs"),
    baselineParam: searchParams.get("baseline"),
    availableRuns: queries.availableRuns,
    runsById: queries.runsById,
    deviceRule,
    sortKey,
    sortDir,
    focusedDiffRunId,
  });

  const actions = useCompareSelectionActions({
    availableRuns: queries.availableRuns,
    distinctUrls: derived.distinctUrls,
    effectiveRunIds: derived.effectiveRunIds,
    urlBaselineId: derived.urlBaselineId,
    baselineRunId: derived.baselineRunId,
    sortedRuns: derived.sortedRuns,
    deviceRule,
    focusedDiffRunId,
    setDeviceRule,
    setFocusedDiffRunId,
  });

  const handleSort = useCallback(
    (nextKey: CompareSortKey) => {
      if (sortKey === nextKey) {
        setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
        return;
      }
      setSortKey(nextKey);
      setSortDir("desc");
    },
    [sortKey],
  );

  const handleCollapseDiff = useCallback(() => {
    setFocusedDiffRunId(null);
  }, []);

  const builder: CompareBuilderModel = useMemo(
    () => ({
      chronoRuns: derived.chronoRuns,
      baselineId: derived.baselineRunId,
      topPresetUrls: derived.distinctUrls.slice(0, 2),
      distinctUrlsCount: derived.distinctUrls.length,
      totalAvailableCount: queries.availableRuns.length,
      totalStoredCount: queries.totalStoredCount,
      urlComboboxOptions: derived.urlComboboxOptions,
      selectedUrls: derived.selectedUrls,
      deviceRule,
      unaddedRuns: derived.unaddedRuns,
      onPresetUrl: actions.handlePresetUrl,
      onPresetLatestPerUrl: actions.handlePresetLatestPerUrl,
      onPresetAllRuns: actions.handlePresetAllRuns,
      onUrlsChange: actions.handleUrlsChange,
      onDeviceRuleChange: actions.handleDeviceRuleChange,
      onAddSpecificRun: actions.handleAddSpecificRun,
      onSetBaseline: actions.handleSetBaseline,
      onRemoveRun: actions.handleRemoveRun,
    }),
    [
      actions,
      derived,
      deviceRule,
      queries.availableRuns.length,
      queries.totalStoredCount,
    ],
  );

  return {
    isListPending: queries.isListPending,
    listErrorMessage: queries.listErrorMessage,
    failedMissingRuns: queries.failedMissingRuns,
    hasAnyRuns: queries.hasAnyRuns,
    handleRetryList: queries.handleRetryList,
    handleRetryMissingRun: queries.handleRetryMissingRun,
    builder,
    chronoRuns: derived.chronoRuns,
    sortedRuns: derived.sortedRuns,
    baselineRun: derived.baselineRun,
    sortKey,
    sortDir,
    diffTargetRun: derived.diffTargetRun,
    fallbackDiffTargetId: derived.fallbackDiffTargetId,
    setFocusedDiffRunId,
    handleSort,
    handleSwapTwoBaseline: actions.handleSwapTwoBaseline,
    handleSetBaseline: actions.handleSetBaseline,
    handleRemoveRun: actions.handleRemoveRun,
    handleCollapseDiff,
  };
}
