"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { lighthouseQueries } from "@/entities/lighthouse-run";

/**
 * Fetches pairwise Insight Audit diff between baseline and target runs for {@link CompareDiffPanel}.
 */
export function useCompareDiff(
  baselineId: string,
  targetId: string | null | undefined,
) {
  const { data, isPending, error, refetch } = useQuery({
    ...lighthouseQueries.diff(baselineId, targetId ?? ""),
    enabled: Boolean(targetId),
  });

  const handleRetryDiff = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    diffData: data,
    isPending,
    errorMessage: error ? error.message : null,
    handleRetryDiff,
  };
}
