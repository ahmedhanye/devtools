import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { lighthouseQueries } from "./lighthouse-queries";

describe("lighthouseQueries factory", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("constructs stable query keys, request URLs, parsed payloads, and refetch intervals", async () => {
    const requestedUrls: string[] = [];
    const mockFetch = vi.fn().mockImplementation(async (input: string) => {
      requestedUrls.push(input);
      if (input.startsWith("/api/lighthouse/audits/active")) {
        return new Response(JSON.stringify({ active: false, job: null }), {
          status: 200,
        });
      }
      if (input.startsWith("/api/lighthouse/diff")) {
        return new Response(
          JSON.stringify({
            baseline: {
              id: "r1",
              url: "https://example.com/",
              finalUrl: "https://example.com/",
              formFactor: "mobile",
              throttlingMethod: "simulate",
              performanceScore: 80,
              accessibilityScore: 90,
              bestPracticesScore: 90,
              seoScore: 90,
              lcpMs: 2500,
              cls: 0.05,
              tbtMs: 120,
              fcpMs: 1000,
              siMs: 1800,
              ttfbMs: 300,
              durationMs: 3000,
              createdAt: "2026-11-22T01:00:00.000Z",
              hasHtmlReport: false,
              summary: {
                lcpElement: null,
                lcpPhases: null,
                clsCulprits: [],
                insights: [],
                failedAudits: [],
                runWarnings: [],
                runtimeError: null,
                medianMetadata: null,
              },
            },
            comparison: {
              id: "r2",
              url: "https://example.com/",
              finalUrl: "https://example.com/",
              formFactor: "mobile",
              throttlingMethod: "simulate",
              performanceScore: 90,
              accessibilityScore: 95,
              bestPracticesScore: 90,
              seoScore: 90,
              lcpMs: 1800,
              cls: 0.02,
              tbtMs: 90,
              fcpMs: 900,
              siMs: 1500,
              ttfbMs: 250,
              durationMs: 2800,
              createdAt: "2026-11-22T02:00:00.000Z",
              hasHtmlReport: false,
              summary: {
                lcpElement: null,
                lcpPhases: null,
                clsCulprits: [],
                insights: [],
                failedAudits: [],
                runWarnings: [],
                runtimeError: null,
                medianMetadata: null,
              },
            },
            deltas: {
              scores: {
                performanceScore: 10,
                accessibilityScore: 5,
                bestPracticesScore: 0,
                seoScore: 0,
              },
              metrics: {
                lcpMs: -700,
                cls: -0.03,
                tbtMs: -30,
                fcpMs: -100,
                siMs: -300,
                ttfbMs: -50,
              },
              insights: { resolved: [], regressed: [], clsCulpritDelta: 0 },
            },
          }),
          { status: 200 },
        );
      }
      if (input === "/api/lighthouse/runs/r1") {
        return new Response(
          JSON.stringify({
            id: "r1",
            url: "https://example.com/",
            finalUrl: "https://example.com/",
            formFactor: "mobile",
            throttlingMethod: "simulate",
            performanceScore: 80,
            accessibilityScore: 90,
            bestPracticesScore: 90,
            seoScore: 90,
            lcpMs: 2500,
            cls: 0.05,
            tbtMs: 120,
            fcpMs: 1000,
            siMs: 1800,
            ttfbMs: 300,
            durationMs: 3000,
            createdAt: "2026-11-22T01:00:00.000Z",
            hasHtmlReport: false,
            summary: {
              lcpElement: null,
              lcpPhases: null,
              clsCulprits: [],
              insights: [],
              failedAudits: [],
              runWarnings: [],
              runtimeError: null,
              medianMetadata: null,
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ runs: [], total: 0, limit: 50, offset: 0 }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", mockFetch);

    const listOpts = lighthouseQueries.list({ formFactor: "desktop" });
    const recentOpts = lighthouseQueries.recentUrls();
    const detailOpts = lighthouseQueries.detail("r1");
    const diffOpts = lighthouseQueries.diff("r1", "r2");
    const activeOpts = lighthouseQueries.activeJob();

    expect(listOpts.queryKey).toEqual([
      "lighthouse",
      "runs",
      { formFactor: "desktop" },
    ]);
    expect(recentOpts.queryKey).toEqual(["lighthouse", "recent-urls"]);
    expect(detailOpts.queryKey).toEqual(["lighthouse", "run", "r1"]);
    expect(diffOpts.queryKey).toEqual(["lighthouse", "diff", "r1", "r2"]);
    expect(activeOpts.queryKey).toEqual(["lighthouse", "active-job"]);
    expect(activeOpts.refetchOnWindowFocus).toBe("always");

    const client = new QueryClient();
    const listResult = await client.fetchQuery(listOpts);
    const recentResult = await client.fetchQuery(recentOpts);
    const detailResult = await client.fetchQuery(detailOpts);
    const diffResult = await client.fetchQuery(diffOpts);
    const activeResult = await client.fetchQuery(activeOpts);

    expect(requestedUrls).toEqual([
      "/api/lighthouse/runs?formFactor=desktop",
      "/api/lighthouse/runs?limit=100&offset=0",
      "/api/lighthouse/runs/r1",
      "/api/lighthouse/diff?baseline=r1&comparison=r2",
      "/api/lighthouse/audits/active",
    ]);
    expect(listResult).toEqual({ runs: [], total: 0, limit: 50, offset: 0 });
    expect(recentResult).toEqual({ runs: [], total: 0, limit: 50, offset: 0 });
    expect(detailResult.id).toBe("r1");
    expect(detailResult.performanceScore).toBe(80);
    expect(diffResult.baseline.id).toBe("r1");
    expect(diffResult.comparison.id).toBe("r2");
    expect(diffResult.deltas.scores.performanceScore).toBe(10);
    expect(activeResult).toEqual({ active: false, job: null });
    client.clear();
  });

  it("polls activeJob every 4s only while an Audit Job is active", async () => {
    vi.useFakeTimers();
    let isActive = false;
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            isActive
              ? {
                  active: true,
                  job: {
                    id: "job-1",
                    url: "https://example.com/",
                    formFactor: "mobile",
                    throttlingMethod: "simulate",
                    runs: 1,
                    categories: ["performance"],
                    status: "running",
                    startedAt: "2026-11-22T01:00:00.000Z",
                    completedAt: null,
                    latestProgress: null,
                    runId: null,
                    error: null,
                  },
                }
              : { active: false, job: null },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    const inactiveHook = renderHook(
      () => useQuery(lighthouseQueries.activeJob()),
      { wrapper },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    inactiveHook.unmount();

    isActive = true;
    fetchMock.mockClear();
    const activeHook = renderHook(
      () => useQuery(lighthouseQueries.activeJob()),
      { wrapper },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    activeHook.unmount();
    client.clear();
  });
});
