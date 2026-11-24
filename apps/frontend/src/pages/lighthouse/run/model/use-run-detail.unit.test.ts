import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRunDetail } from "./use-run-detail";

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

const RUN_2_DETAIL = {
  id: "run-2",
  url: "https://shop.example.com/",
  finalUrl: "https://shop.example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  performanceScore: 91,
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

describe("useRunDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads run detail, pairs compareHref with previous run for same URL, and retries", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/lighthouse/runs/run-2")) {
        return new Response(JSON.stringify(RUN_2_DETAIL), { status: 200 });
      }
      if (url.includes("/api/lighthouse/runs?")) {
        return new Response(
          JSON.stringify({
            runs: [
              {
                id: "run-1",
                url: "https://shop.example.com/",
                finalUrl: "https://shop.example.com/",
                formFactor: "mobile",
                throttlingMethod: "simulate",
                performanceScore: 88,
                accessibilityScore: 95,
                bestPracticesScore: 94,
                seoScore: 98,
                lcpMs: 2100,
                cls: 0.05,
                tbtMs: 120,
                fcpMs: 1100,
                siMs: 1600,
                ttfbMs: 210,
                durationMs: 3600,
                hasHtmlReport: true,
                createdAt: "2026-11-22T01:00:00.000Z",
              },
            ],
            total: 1,
            limit: 100,
            offset: 0,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useRunDetail("run-2"), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.run?.id).toBe("run-2"));
    await waitFor(() =>
      expect(result.current.compareHref).toContain("runs=run-1%2Crun-2"),
    );

    act(() => {
      result.current.handleRetryRun();
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
  });

  it("falls back to single-run compareHref when no prior run exists for the same URL", async () => {
    const { summary: _summary, ...run2Summary } = RUN_2_DETAIL;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/api/lighthouse/runs/run-2")) {
        return new Response(JSON.stringify(RUN_2_DETAIL), { status: 200 });
      }
      if (url.includes("/api/lighthouse/runs?")) {
        return new Response(
          JSON.stringify({
            runs: [
              run2Summary,
              {
                ...run2Summary,
                id: "run-other",
                url: "https://other.example.com/",
                finalUrl: "https://other.example.com/",
              },
            ],
            total: 2,
            limit: 100,
            offset: 0,
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useRunDetail("run-2"), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.run?.id).toBe("run-2"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    expect(result.current.compareHref).toBe(
      "/lighthouse/compare?runs=run-2&baseline=run-2",
    );
  });
});
