import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompareDiff } from "./use-compare-diff";

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function makeRunDetail(id: string) {
  return {
    id,
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    formFactor: "mobile" as const,
    throttlingMethod: "simulate" as const,
    performanceScore: 90,
    accessibilityScore: 95,
    bestPracticesScore: 94,
    seoScore: 98,
    lcpMs: 2000,
    cls: 0.04,
    tbtMs: 100,
    fcpMs: 1000,
    siMs: 1500,
    ttfbMs: 200,
    durationMs: 3500,
    hasHtmlReport: true,
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
    createdAt: "2026-11-22T02:00:00.000Z",
  };
}

describe("useCompareDiff", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not fetch when targetId is null and fetches/retries when provided", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            baseline: makeRunDetail("run-1"),
            comparison: makeRunDetail("run-2"),
            deltas: {
              scores: {
                performanceScore: 5,
                accessibilityScore: 0,
                bestPracticesScore: 0,
                seoScore: 0,
              },
              metrics: {
                lcpMs: -100,
                cls: 0,
                tbtMs: -10,
                fcpMs: -50,
                siMs: -50,
                ttfbMs: -10,
              },
              insights: {
                resolved: [],
                regressed: [],
                clsCulpritDelta: 0,
              },
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result, rerender } = renderHook(
      ({ targetId }: { targetId: string | null }) =>
        useCompareDiff("run-1", targetId),
      {
        initialProps: { targetId: null as string | null },
        wrapper: createWrapper(client),
      },
    );

    expect(fetchSpy).not.toHaveBeenCalled();

    rerender({ targetId: "run-2" });
    await waitFor(() => expect(result.current.diffData).toBeDefined());

    act(() => {
      result.current.handleRetryDiff();
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
