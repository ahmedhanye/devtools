"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  formatTimestamp,
  lighthouseQueries,
  shortRunId,
} from "@/entities/lighthouse-run";

export type InspectorTab = "summary" | "report";

/**
 * Manages Audit Run detail fetching and Summary/HTML Report tab state for {@link RunInspectorSheet}.
 */
export function useRunInspector(runId: string | null) {
  const [tabState, setTabState] = useState<{
    runId: string | null;
    tab: InspectorTab;
  }>({ runId: null, tab: "summary" });

  const activeTab: InspectorTab =
    tabState.runId === runId ? tabState.tab : "summary";

  const {
    data: run,
    isPending,
    error,
    refetch,
  } = useQuery({
    ...lighthouseQueries.detail(runId ?? ""),
    enabled: Boolean(runId),
  });

  const handleTabChange = useCallback(
    (nextValue: unknown) => {
      if (nextValue === "summary" || nextValue === "report") {
        setTabState({ runId, tab: nextValue });
      }
    },
    [runId],
  );

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const descriptionText = run
    ? `${run.url} · ${formatTimestamp(run.createdAt)}`
    : runId
      ? `Inspecting run ${shortRunId(runId)}`
      : "Select an Audit Run to inspect";

  return {
    run,
    isPending,
    errorMessage: error ? error.message : null,
    activeTab,
    descriptionText,
    handleTabChange,
    handleRetry,
  };
}
