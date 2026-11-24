import { createElement, type ReactNode } from "react";
import type {
  LighthouseRunDetail,
  LighthouseRunListItem,
} from "@devtools/lighthouse/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateNativeSearchParams } from "@/shared/lib";
import { useCompareController } from "./use-compare-state";

function makeRun(
  overrides: Partial<LighthouseRunListItem> & {
    id: string;
    url: string;
    createdAt: string;
  },
): LighthouseRunListItem {
  return {
    finalUrl: overrides.url,
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 90,
    accessibilityScore: 95,
    bestPracticesScore: 94,
    seoScore: 98,
    lcpMs: 2000,
    cls: 0.04,
    tbtMs: 100,
    fcpMs: 1000,
    siMs: 1600,
    ttfbMs: 250,
    durationMs: 3800,
    hasHtmlReport: true,
    ...overrides,
  };
}

function toDetail(run: LighthouseRunListItem): LighthouseRunDetail {
  return {
    ...run,
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
  };
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe("useCompareController", () => {
  const originalHref = window.location.href;

  const r3 = makeRun({
    id: "cmp-3",
    url: "https://shop.example.com/",
    createdAt: "2026-11-22T02:00:00.000Z",
    formFactor: "mobile",
    performanceScore: 94,
  });
  const r2 = makeRun({
    id: "cmp-2",
    url: "https://shop.example.com/checkout",
    createdAt: "2026-11-21T02:00:00.000Z",
    formFactor: "desktop",
    performanceScore: 78,
  });
  const r1 = makeRun({
    id: "cmp-1",
    url: "https://shop.example.com/",
    createdAt: "2026-11-20T02:00:00.000Z",
    formFactor: "mobile",
    performanceScore: 84,
  });
  const extraRun = makeRun({
    id: "cmp-extra",
    url: "https://shop.example.com/cart",
    createdAt: "2026-11-19T02:00:00.000Z",
    formFactor: "mobile",
    performanceScore: 88,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    updateNativeSearchParams("", { replace: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", originalHref);
  });

  it("manages URL selection, presets, device filtering, sorting, diff focus, and baseline actions", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "/api/lighthouse/runs/cmp-extra") {
        return new Response(JSON.stringify(toDetail(extraRun)), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          runs: [r3, r2, r1],
          total: 3,
          limit: 100,
          offset: 0,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useCompareController(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.isListPending).toBe(false));
    expect(result.current.hasAnyRuns).toBe(true);
    expect(result.current.chronoRuns.map((run) => run.id)).toEqual([
      "cmp-1",
      "cmp-3",
    ]);
    expect(result.current.baselineRun?.id).toBe("cmp-1");
    expect(result.current.diffTargetRun?.id).toBe("cmp-3");

    act(() => {
      result.current.builder.onPresetAllRuns();
    });
    expect(window.location.search).toBe(
      "?runs=cmp-1%2Ccmp-2%2Ccmp-3&baseline=cmp-1",
    );
    expect(result.current.sortedRuns).toHaveLength(3);
    expect(result.current.diffTargetRun).toBeNull();

    act(() => {
      result.current.setFocusedDiffRunId("cmp-2");
    });
    expect(result.current.diffTargetRun?.id).toBe("cmp-2");

    act(() => {
      result.current.builder.onDeviceRuleChange("mobile");
    });
    expect(result.current.builder.deviceRule).toBe("mobile");
    expect(result.current.sortedRuns.map((run) => run.id)).toEqual([
      "cmp-3",
      "cmp-1",
    ]);

    act(() => {
      result.current.builder.onDeviceRuleChange("invalid-device");
      result.current.builder.onDeviceRuleChange(null);
    });
    expect(result.current.builder.deviceRule).toBe("mobile");

    act(() => {
      result.current.builder.onDeviceRuleChange("all");
    });
    expect(result.current.diffTargetRun?.id).toBe("cmp-2");

    act(() => {
      result.current.builder.onDeviceRuleChange("desktop");
    });
    expect(result.current.sortedRuns.map((run) => run.id)).toEqual(["cmp-2"]);
    expect(result.current.diffTargetRun).toBeNull();

    act(() => {
      result.current.builder.onDeviceRuleChange("all");
    });
    expect(result.current.sortedRuns).toHaveLength(3);

    act(() => {
      result.current.setFocusedDiffRunId("cmp-extra");
    });
    expect(result.current.diffTargetRun).toBeNull();

    act(() => {
      result.current.setFocusedDiffRunId("cmp-2");
    });
    expect(result.current.diffTargetRun?.id).toBe("cmp-2");

    act(() => {
      result.current.handleCollapseDiff();
    });
    expect(result.current.diffTargetRun).toBeNull();

    act(() => {
      result.current.handleSort("performanceScore");
    });
    expect(result.current.sortKey).toBe("performanceScore");
    expect(result.current.sortDir).toBe("desc");

    act(() => {
      result.current.handleSort("performanceScore");
    });
    expect(result.current.sortDir).toBe("asc");

    act(() => {
      result.current.handleSort("performanceScore");
    });
    expect(result.current.sortDir).toBe("desc");

    act(() => {
      result.current.builder.onAddSpecificRun("cmp-1");
    });
    expect(window.location.search).toBe(
      "?runs=cmp-1%2Ccmp-2%2Ccmp-3&baseline=cmp-1",
    );

    act(() => {
      result.current.handleRemoveRun("cmp-1");
    });
    expect(window.location.search).toBe("?runs=cmp-2%2Ccmp-3&baseline=cmp-2");

    act(() => {
      result.current.handleSwapTwoBaseline();
    });
    expect(window.location.search).toBe("?runs=cmp-2%2Ccmp-3&baseline=cmp-3");

    act(() => {
      result.current.setFocusedDiffRunId("cmp-2");
      result.current.handleSetBaseline("cmp-2");
    });
    expect(window.location.search).toBe("?runs=cmp-2%2Ccmp-3&baseline=cmp-2");

    act(() => {
      result.current.builder.onPresetLatestPerUrl();
    });
    expect(window.location.search).toBe("?runs=cmp-2%2Ccmp-3&baseline=cmp-2");

    act(() => {
      result.current.builder.onPresetUrl("https://shop.example.com/checkout");
    });
    expect(window.location.search).toBe("?runs=cmp-2&baseline=cmp-2");

    act(() => {
      result.current.handleSwapTwoBaseline();
    });
    expect(window.location.search).toBe("?runs=cmp-2&baseline=cmp-2");

    act(() => {
      result.current.handleRemoveRun("cmp-2");
    });
    expect(window.location.search).toBe("?runs=");
    expect(result.current.baselineRun).toBeNull();

    act(() => {
      result.current.handleSwapTwoBaseline();
    });
    expect(window.location.search).toBe("?runs=");

    act(() => {
      result.current.builder.onAddSpecificRun("cmp-extra");
    });
    expect(window.location.search).toBe("?runs=cmp-extra&baseline=cmp-extra");
    await waitFor(() =>
      expect(result.current.chronoRuns.map((run) => run.id)).toEqual([
        "cmp-extra",
      ]),
    );

    act(() => {
      result.current.builder.onUrlsChange(["https://shop.example.com/"]);
    });
    expect(window.location.search).toBe("?runs=cmp-1%2Ccmp-3&baseline=cmp-1");

    unmount();
    client.clear();
  });

  it("handles list error retry and removing focused diff run", async () => {
    let failList = true;
    const fetchMock = vi.fn(async () => {
      if (failList) {
        return new Response(
          JSON.stringify({
            error: { code: "INTERNAL", message: "Runs query unavailable" },
          }),
          { status: 500 },
        );
      }
      return new Response(
        JSON.stringify({
          runs: [r3, r2, r1],
          total: 3,
          limit: 100,
          offset: 0,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    updateNativeSearchParams("?runs=cmp-1,cmp-2,cmp-3&baseline=cmp-1", {
      replace: true,
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useCompareController(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() =>
      expect(result.current.listErrorMessage).toBe("Runs query unavailable"),
    );

    failList = false;
    act(() => {
      result.current.handleRetryList();
    });
    await waitFor(() => expect(result.current.sortedRuns).toHaveLength(3));

    act(() => {
      result.current.setFocusedDiffRunId("cmp-2");
    });
    expect(result.current.diffTargetRun?.id).toBe("cmp-2");

    act(() => {
      result.current.handleRemoveRun("cmp-2");
    });
    expect(window.location.search).toBe("?runs=cmp-1%2Ccmp-3&baseline=cmp-1");
    expect(result.current.diffTargetRun?.id).toBe("cmp-3");

    unmount();
    client.clear();
  });

  it("picks the newest chronological non-baseline run for fallbackDiffTargetId regardless of table sort", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          runs: [r3, r2, r1],
          total: 3,
          limit: 100,
          offset: 0,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    updateNativeSearchParams("?runs=cmp-1,cmp-2,cmp-3&baseline=cmp-1", {
      replace: true,
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useCompareController(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.isListPending).toBe(false));

    act(() => {
      result.current.handleSort("createdAt");
    });
    expect(result.current.sortDir).toBe("asc");
    expect(result.current.fallbackDiffTargetId).toBe("cmp-3");

    act(() => {
      result.current.handleSetBaseline("cmp-3");
    });
    expect(result.current.fallbackDiffTargetId).toBe("cmp-2");

    unmount();
    client.clear();
  });

  it("surfaces errors for failed selected detail runs and retries them", async () => {
    let failExtra = true;
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "/api/lighthouse/runs/cmp-extra") {
        if (failExtra) {
          return new Response(
            JSON.stringify({
              error: { code: "INTERNAL", message: "Detail run unavailable" },
            }),
            { status: 500 },
          );
        }
        return new Response(JSON.stringify(toDetail(extraRun)), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          runs: [r3, r2, r1],
          total: 3,
          limit: 100,
          offset: 0,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    updateNativeSearchParams("?runs=cmp-extra,cmp-1&baseline=cmp-extra", {
      replace: true,
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useCompareController(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() =>
      expect(result.current.listErrorMessage).toBe("Detail run unavailable"),
    );

    failExtra = false;
    act(() => {
      result.current.handleRetryList();
    });

    await waitFor(() => expect(result.current.listErrorMessage).toBeNull());
    await waitFor(() => expect(result.current.isListPending).toBe(false));
    expect(result.current.baselineRun?.id).toBe("cmp-extra");
    expect(result.current.chronoRuns.map((run) => run.id)).toEqual([
      "cmp-extra",
      "cmp-1",
    ]);

    unmount();
    client.clear();
  });
});
