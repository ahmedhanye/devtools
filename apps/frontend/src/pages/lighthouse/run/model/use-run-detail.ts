"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildCompareUrl, lighthouseQueries } from "@/entities/lighthouse-run";

/**
 * Fetches Audit Run detail and recent URLs to compute compare links and retry handlers
 * for {@link RunPage}.
 */
export function useRunDetail(runId: string) {
  const {
    data: run,
    isPending: isRunPending,
    error: runError,
    refetch: refetchRun,
  } = useQuery(lighthouseQueries.detail(runId));

  const { data: recentRunsData } = useQuery(lighthouseQueries.recentUrls());

  const compareHref = useMemo(() => {
    if (!run) {
      return buildCompareUrl();
    }
    const previousForUrl = (recentRunsData?.runs ?? []).find(
      (candidate) => candidate.url === run.url && candidate.id !== run.id,
    );
    return previousForUrl
      ? buildCompareUrl({
          runIds: [previousForUrl.id, run.id],
          baselineId: previousForUrl.id,
        })
      : buildCompareUrl({
          runIds: [run.id],
          baselineId: run.id,
        });
  }, [recentRunsData?.runs, run]);

  const handleRetryRun = useCallback(() => {
    void refetchRun();
  }, [refetchRun]);

  return {
    run,
    isRunPending,
    errorMessage: runError ? runError.message : null,
    compareHref,
    handleRetryRun,
  };
}
