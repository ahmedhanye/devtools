"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildCompareUrl, lighthouseQueries } from "@/entities/lighthouse-run";

function findPreviousSameUrlRun(
  runs: readonly { id: string; url: string; createdAt: string }[],
  currentRun: { id: string; url: string; createdAt: string },
): string | null {
  const runTime = new Date(currentRun.createdAt).getTime();
  let bestId: string | null = null;
  let bestTime = -Infinity;
  for (const candidate of runs) {
    if (candidate.url !== currentRun.url || candidate.id === currentRun.id) {
      continue;
    }
    const candidateTime = new Date(candidate.createdAt).getTime();
    if (candidateTime < runTime && candidateTime > bestTime) {
      bestId = candidate.id;
      bestTime = candidateTime;
    }
  }
  return bestId;
}

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
    const previousId = findPreviousSameUrlRun(recentRunsData?.runs ?? [], run);
    return previousId
      ? buildCompareUrl({
          runIds: [previousId, run.id],
          baselineId: previousId,
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
