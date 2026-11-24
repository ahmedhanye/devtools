import type { ListLighthouseRunsQuery } from "@devtools/lighthouse/schemas";
import { queryOptions } from "@tanstack/react-query";
import {
  getActiveAuditJob,
  getLighthouseDiff,
  getLighthouseRun,
  listLighthouseRuns,
} from "./lighthouse-api";

/**
 * TanStack Query key & options factory for Lighthouse runs, diffs, and active jobs.
 */
export const lighthouseQueries = {
  all: () => ["lighthouse"] as const,
  lists: () => [...lighthouseQueries.all(), "runs"] as const,
  list: (filters: ListLighthouseRunsQuery = {}) =>
    queryOptions({
      queryKey: [...lighthouseQueries.lists(), filters] as const,
      queryFn: ({ signal }) => listLighthouseRuns(filters, signal),
    }),
  recentUrls: () =>
    queryOptions({
      queryKey: [...lighthouseQueries.all(), "recent-urls"] as const,
      queryFn: ({ signal }) =>
        listLighthouseRuns({ limit: 100, offset: 0 }, signal),
      staleTime: 30_000,
    }),
  detail: (runId: string) =>
    queryOptions({
      queryKey: [...lighthouseQueries.all(), "run", runId] as const,
      queryFn: ({ signal }) => getLighthouseRun(runId, signal),
    }),
  diff: (baselineId: string, comparisonId: string) =>
    queryOptions({
      queryKey: [
        ...lighthouseQueries.all(),
        "diff",
        baselineId,
        comparisonId,
      ] as const,
      queryFn: ({ signal }) =>
        getLighthouseDiff(baselineId, comparisonId, signal),
    }),
  activeJob: () =>
    queryOptions({
      queryKey: [...lighthouseQueries.all(), "active-job"] as const,
      queryFn: ({ signal }) => getActiveAuditJob(signal),
      staleTime: 1_000,
      refetchInterval: (query) => (query.state.data?.active ? 4_000 : false),
    }),
};

/**
 * Mutation keys shared across Lighthouse audit triggers.
 */
export const lighthouseMutationKeys = {
  triggerAudit: ["lighthouse", "trigger-audit"] as const,
};
