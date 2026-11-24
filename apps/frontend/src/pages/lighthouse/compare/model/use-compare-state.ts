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

function useCompareRunQueries(runsParam: string | null) {
  const {
    data: listData,
    isPending: isListPending,
    error: listError,
    refetch: refetchList,
  } = useQuery(lighthouseQueries.recentUrls());

  const availableRuns = useMemo(() => listData?.runs ?? [], [listData?.runs]);
  const explicitRunIds = useMemo(
    () => parseCompareRunsParam(runsParam),
    [runsParam],
  );

  const missingRunQueries = useQueries({
    queries: explicitRunIds
      .filter((id) => !availableRuns.some((run) => run.id === id))
      .map((id) => lighthouseQueries.detail(id)),
  });

  const runsById = useMemo(() => {
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
  }, [availableRuns, missingRunQueries]);

  const handleRetryList = useCallback(() => {
    void refetchList();
  }, [refetchList]);

  return {
    availableRuns,
    runsById,
    isListPending,
    listErrorMessage: listError ? listError.message : null,
    hasAnyRuns: availableRuns.length > 0 || runsById.size > 0,
    handleRetryList,
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
    () => sortedRuns.find((run) => run.id !== baselineRunId)?.id ?? null,
    [baselineRunId, sortedRuns],
  );

  return useMemo(
    () => ({
      effectiveRunIds: effectiveSelection.runIds,
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
      syncCompareSearchParams(nextIds, baselineRunId ?? runId);
    },
    [baselineRunId, effectiveRunIds],
  );

  const handleSetBaseline = useCallback(
    (runId: string) => syncCompareSearchParams(effectiveRunIds, runId),
    [effectiveRunIds],
  );

  const handleRemoveRun = useCallback(
    (runId: string) => {
      const nextIds = effectiveRunIds.filter((id) => id !== runId);
      const nextBase =
        baselineRunId === runId ? (nextIds[0] ?? null) : baselineRunId;
      if (focusedDiffRunId === runId) {
        setFocusedDiffRunId(null);
      }
      syncCompareSearchParams(nextIds, nextBase);
    },
    [baselineRunId, effectiveRunIds, focusedDiffRunId, setFocusedDiffRunId],
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
    [actions, derived, deviceRule, queries.availableRuns.length],
  );

  return {
    isListPending: queries.isListPending,
    listErrorMessage: queries.listErrorMessage,
    hasAnyRuns: queries.hasAnyRuns,
    handleRetryList: queries.handleRetryList,
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
