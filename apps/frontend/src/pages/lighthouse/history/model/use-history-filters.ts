"use client";

import type * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type LighthouseFormFactor,
  LighthouseFormFactorSchema,
  type LighthouseRunListItem,
  type LighthouseThrottlingMethod,
  LighthouseThrottlingMethodSchema,
} from "@devtools/lighthouse/schemas";
import {
  buildCompareUrl,
  extractDistinctUrls,
  lighthouseQueries,
  sortChronologicalRuns,
} from "@/entities/lighthouse-run";

export const HISTORY_PAGE_SIZE = 20;

export interface HistoryFiltersModel {
  search: string;
  urlFilter: string;
  deviceFilter: "all" | LighthouseFormFactor;
  throttlingFilter: "all" | LighthouseThrottlingMethod;
  urlOptions: readonly { url: string; label: string }[];
  urlFilterItems: Record<string, string>;
  hasFilters: boolean;
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUrlChange: (value: string | null) => void;
  onDeviceChange: (value: string | null) => void;
  onThrottlingChange: (value: string | null) => void;
  onClear: () => void;
}

export interface HistoryTableStateModel {
  isPending: boolean;
  errorMessage: string | null;
  runs: readonly LighthouseRunListItem[];
  total: number;
  offset: number;
  hasFilters: boolean;
  allVisibleChecked: boolean;
  checkedRunsById: Record<string, LighthouseRunListItem>;
  onToggleAllVisible: () => void;
  onToggleCheck: (run: LighthouseRunListItem) => void;
  onClearFilters: () => void;
  onRetry: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

function useHistoryFilterInputs() {
  const [search, setSearch] = useState("");
  const [urlFilter, setUrlFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState<
    "all" | LighthouseFormFactor
  >("all");
  const [throttlingFilter, setThrottlingFilter] = useState<
    "all" | LighthouseThrottlingMethod
  >("all");
  const [offset, setOffset] = useState(0);

  const onSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value);
      setOffset(0);
    },
    [],
  );

  const onUrlChange = useCallback((value: string | null) => {
    setUrlFilter(value ?? "all");
    setOffset(0);
  }, []);

  const onDeviceChange = useCallback((value: string | null) => {
    if (value === "all") {
      setDeviceFilter("all");
      setOffset(0);
      return;
    }
    const parsed = LighthouseFormFactorSchema.safeParse(value);
    if (parsed.success) {
      setDeviceFilter(parsed.data);
      setOffset(0);
    }
  }, []);

  const onThrottlingChange = useCallback((value: string | null) => {
    if (value === "all") {
      setThrottlingFilter("all");
      setOffset(0);
      return;
    }
    const parsed = LighthouseThrottlingMethodSchema.safeParse(value);
    if (parsed.success) {
      setThrottlingFilter(parsed.data);
      setOffset(0);
    }
  }, []);

  const onClearFilters = useCallback(() => {
    setSearch("");
    setUrlFilter("all");
    setDeviceFilter("all");
    setThrottlingFilter("all");
    setOffset(0);
  }, []);

  const onPrevPage = useCallback(() => {
    setOffset((prev) => Math.max(0, prev - HISTORY_PAGE_SIZE));
  }, []);

  const onNextPage = useCallback(() => {
    setOffset((prev) => prev + HISTORY_PAGE_SIZE);
  }, []);

  const hasFilters = Boolean(
    search.trim() ||
    urlFilter !== "all" ||
    deviceFilter !== "all" ||
    throttlingFilter !== "all",
  );

  return useMemo(
    () => ({
      search,
      urlFilter,
      deviceFilter,
      throttlingFilter,
      offset,
      hasFilters,
      onSearchChange,
      onUrlChange,
      onDeviceChange,
      onThrottlingChange,
      onClearFilters,
      onPrevPage,
      onNextPage,
    }),
    [
      deviceFilter,
      hasFilters,
      offset,
      onClearFilters,
      onDeviceChange,
      onNextPage,
      onPrevPage,
      onSearchChange,
      onThrottlingChange,
      onUrlChange,
      search,
      throttlingFilter,
      urlFilter,
    ],
  );
}

function useHistorySelection(runs: readonly LighthouseRunListItem[]) {
  const [checkedRunsById, setCheckedRunsById] = useState<
    Record<string, LighthouseRunListItem>
  >({});

  const checkedIds = useMemo(
    () => Object.keys(checkedRunsById),
    [checkedRunsById],
  );

  const compareSelectedHref = useMemo(() => {
    const oldestId = sortChronologicalRuns(Object.values(checkedRunsById))[0]
      ?.id;
    return buildCompareUrl({ runIds: checkedIds, baselineId: oldestId });
  }, [checkedIds, checkedRunsById]);

  const allVisibleChecked =
    runs.length > 0 && runs.every((run) => Boolean(checkedRunsById[run.id]));

  const onToggleCheck = useCallback((run: LighthouseRunListItem) => {
    setCheckedRunsById((prev) => {
      if (prev[run.id]) {
        const next = { ...prev };
        delete next[run.id];
        return next;
      }
      return { ...prev, [run.id]: run };
    });
  }, []);

  const onToggleAllVisible = useCallback(() => {
    setCheckedRunsById((prev) => {
      const next = { ...prev };
      for (const run of runs) {
        if (allVisibleChecked) {
          delete next[run.id];
        } else {
          next[run.id] = run;
        }
      }
      return next;
    });
  }, [allVisibleChecked, runs]);

  const onClearChecked = useCallback(() => {
    setCheckedRunsById({});
  }, []);

  return useMemo(
    () => ({
      checkedRunsById,
      checkedCount: checkedIds.length,
      compareSelectedHref,
      allVisibleChecked,
      onToggleCheck,
      onToggleAllVisible,
      onClearChecked,
    }),
    [
      allVisibleChecked,
      checkedIds.length,
      checkedRunsById,
      compareSelectedHref,
      onClearChecked,
      onToggleAllVisible,
      onToggleCheck,
    ],
  );
}

function buildHistoryListQueryOptions(
  inputs: ReturnType<typeof useHistoryFilterInputs>,
) {
  return lighthouseQueries.list({
    search: inputs.search.trim() || undefined,
    url: inputs.urlFilter === "all" ? undefined : inputs.urlFilter,
    formFactor: inputs.deviceFilter === "all" ? undefined : inputs.deviceFilter,
    throttlingMethod:
      inputs.throttlingFilter === "all" ? undefined : inputs.throttlingFilter,
    limit: HISTORY_PAGE_SIZE,
    offset: inputs.offset,
  });
}

function useHistoryUrlOptions() {
  const recentUrlsQuery = useQuery(lighthouseQueries.recentUrls());

  const urlOptions = useMemo(
    () => extractDistinctUrls(recentUrlsQuery.data?.runs ?? []),
    [recentUrlsQuery.data?.runs],
  );

  const urlFilterItems = useMemo(() => {
    const items: Record<string, string> = { all: "All URLs & Domains" };
    for (const option of urlOptions) {
      items[option.url] = option.label;
    }
    return items;
  }, [urlOptions]);

  return { urlOptions, urlFilterItems };
}

/**
 * Manages Audit History filtering, pagination, and multi-run checkbox selection.
 */
export function useHistoryController() {
  const inputs = useHistoryFilterInputs();
  const latestQuery = useQuery(lighthouseQueries.list({ limit: 1, offset: 0 }));
  const { urlOptions, urlFilterItems } = useHistoryUrlOptions();
  const { data, isPending, error, refetch } = useQuery({
    ...buildHistoryListQueryOptions(inputs),
    placeholderData: keepPreviousData,
  });

  const runs = useMemo(() => data?.runs ?? [], [data?.runs]);
  const total = data?.total ?? 0;
  const selection = useHistorySelection(runs);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const filters: HistoryFiltersModel = useMemo(
    () => ({
      search: inputs.search,
      urlFilter: inputs.urlFilter,
      deviceFilter: inputs.deviceFilter,
      throttlingFilter: inputs.throttlingFilter,
      urlOptions,
      urlFilterItems,
      hasFilters: inputs.hasFilters,
      onSearchChange: inputs.onSearchChange,
      onUrlChange: inputs.onUrlChange,
      onDeviceChange: inputs.onDeviceChange,
      onThrottlingChange: inputs.onThrottlingChange,
      onClear: inputs.onClearFilters,
    }),
    [inputs, urlFilterItems, urlOptions],
  );

  const tableState: HistoryTableStateModel = useMemo(
    () => ({
      isPending,
      errorMessage: error ? error.message : null,
      runs,
      total,
      offset: inputs.offset,
      hasFilters: inputs.hasFilters,
      allVisibleChecked: selection.allVisibleChecked,
      checkedRunsById: selection.checkedRunsById,
      onToggleAllVisible: selection.onToggleAllVisible,
      onToggleCheck: selection.onToggleCheck,
      onClearFilters: inputs.onClearFilters,
      onRetry,
      onPrevPage: inputs.onPrevPage,
      onNextPage: inputs.onNextPage,
    }),
    [error, inputs, isPending, onRetry, runs, selection, total],
  );

  return {
    latestRun: latestQuery.data?.runs[0] ?? null,
    total,
    checkedCount: selection.checkedCount,
    compareSelectedHref: selection.compareSelectedHref,
    onClearChecked: selection.onClearChecked,
    filters,
    tableState,
  };
}
