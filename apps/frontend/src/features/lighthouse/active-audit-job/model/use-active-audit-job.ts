"use client";

import type * as React from "react";
import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  computeAuditProgressPercent,
  lighthouseQueries,
  PROGRESS_STAGE_LABELS,
} from "@/entities/lighthouse-run";
import { isPlainPrimaryClick, updateNativeSearchParams } from "@/shared/lib";

/**
 * Subscribes to the active Lighthouse Audit Job query and derives progress percentage,
 * stage label, and same-route navigation handling.
 */
export function useActiveAuditJob() {
  const pathname = usePathname();
  const activeJobQuery = useQuery(lighthouseQueries.activeJob());
  const job =
    activeJobQuery.data?.active === true ? activeJobQuery.data.job : null;

  const handleNavigate = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (job && pathname === "/lighthouse/run" && isPlainPrimaryClick(event)) {
        event.preventDefault();
        updateNativeSearchParams(new URLSearchParams({ job: job.id }));
      }
    },
    [job, pathname],
  );

  const currentStage = job?.latestProgress?.stage ?? "locating_browser";
  const pct = computeAuditProgressPercent(
    currentStage,
    job?.latestProgress?.runIndex,
    job?.latestProgress?.totalRuns ?? job?.runs,
  );
  const stageLabel = PROGRESS_STAGE_LABELS[currentStage];

  return {
    job,
    pct,
    stageLabel,
    handleNavigate,
  };
}
