import { createElement, type ReactNode } from "react";
import type { LighthouseRunListItem } from "@devtools/lighthouse/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HISTORY_PAGE_SIZE, useHistoryController } from "./use-history-filters";

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

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe("useHistoryController", () => {
  const r1 = makeRun({
    id: "run-1",
    url: "https://shop.example.com/",
    createdAt: "2026-11-22T02:00:00.000Z",
    formFactor: "mobile",
    throttlingMethod: "simulate",
  });
  const r2 = makeRun({
    id: "run-2",
    url: "https://shop.example.com/checkout",
    createdAt: "2026-11-21T02:00:00.000Z",
    formFactor: "desktop",
    throttlingMethod: "devtools",
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads runs, handles filters including invalid/null fallbacks, pagination, and resets", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string) => {
      requestedUrls.push(input);
      const parsed = new URL(input, "http://localhost");
      const allRuns = [r1, r2];
      const search = parsed.searchParams.get("search")?.toLowerCase() ?? "";
      const urlParam = parsed.searchParams.get("url");
      const formFactor = parsed.searchParams.get("formFactor");
      const throttlingMethod = parsed.searchParams.get("throttlingMethod");
      const limit = Number(parsed.searchParams.get("limit") ?? "50");
      const offset = Number(parsed.searchParams.get("offset") ?? "0");

      const filtered = allRuns.filter((run) => {
        if (search && !run.url.toLowerCase().includes(search)) return false;
        if (urlParam && run.url !== urlParam) return false;
        if (formFactor && run.formFactor !== formFactor) return false;
        if (throttlingMethod && run.throttlingMethod !== throttlingMethod) {
          return false;
        }
        return true;
      });

      return new Response(
        JSON.stringify({
          runs: filtered.slice(offset, offset + limit),
          total: filtered.length,
          limit,
          offset,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useHistoryController(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() =>
      expect(result.current.tableState.isPending).toBe(false),
    );
    expect(result.current.latestRun?.id).toBe("run-1");
    expect(result.current.total).toBe(2);
    expect(result.current.filters.hasFilters).toBe(false);
    expect(result.current.filters.urlFilterItems).toEqual({
      all: "All URLs & Domains",
      "https://shop.example.com/": "shop.example.com/",
      "https://shop.example.com/checkout": "shop.example.com/checkout",
    });

    act(() => {
      result.current.tableState.onNextPage();
    });
    expect(result.current.tableState.offset).toBe(HISTORY_PAGE_SIZE);

    act(() => {
      result.current.tableState.onPrevPage();
      result.current.tableState.onPrevPage();
    });
    expect(result.current.tableState.offset).toBe(0);

    act(() => {
      result.current.tableState.onNextPage();
      result.current.filters.onSearchChange({
        target: { value: "checkout" },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.filters.search).toBe("checkout");
    expect(result.current.filters.hasFilters).toBe(true);
    expect(result.current.tableState.offset).toBe(0);
    await waitFor(() => expect(result.current.total).toBe(1));

    act(() => {
      result.current.filters.onUrlChange("https://shop.example.com/");
    });
    expect(result.current.filters.urlFilter).toBe("https://shop.example.com/");

    act(() => {
      result.current.filters.onUrlChange(null);
    });
    expect(result.current.filters.urlFilter).toBe("all");

    act(() => {
      result.current.filters.onDeviceChange("desktop");
    });
    expect(result.current.filters.deviceFilter).toBe("desktop");

    act(() => {
      result.current.filters.onDeviceChange("invalid-device");
      result.current.filters.onDeviceChange(null);
    });
    expect(result.current.filters.deviceFilter).toBe("desktop");

    act(() => {
      result.current.filters.onDeviceChange("all");
    });
    expect(result.current.filters.deviceFilter).toBe("all");

    act(() => {
      result.current.filters.onThrottlingChange("devtools");
    });
    expect(result.current.filters.throttlingFilter).toBe("devtools");

    act(() => {
      result.current.filters.onThrottlingChange("invalid-throttling");
      result.current.filters.onThrottlingChange(null);
    });
    expect(result.current.filters.throttlingFilter).toBe("devtools");

    act(() => {
      result.current.filters.onThrottlingChange("all");
    });
    expect(result.current.filters.throttlingFilter).toBe("all");

    act(() => {
      result.current.filters.onClear();
    });
    expect(result.current.filters.hasFilters).toBe(false);
    expect(result.current.filters.search).toBe("");
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(
      requestedUrls.some((url) => url.includes("throttlingMethod=devtools")),
    ).toBe(true);

    unmount();
    client.clear();
  });

  it("manages multi-run checkbox selection and recovers from list query errors", async () => {
    let failHistory = true;
    const fetchMock = vi.fn(async (input: string) => {
      if (input.includes("limit=20") && failHistory) {
        return new Response(
          JSON.stringify({
            error: { code: "INTERNAL", message: "Database temporarily locked" },
          }),
          { status: 500 },
        );
      }
      return new Response(
        JSON.stringify({
          runs: [r1, r2],
          total: 2,
          limit: 20,
          offset: 0,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useHistoryController(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() =>
      expect(result.current.tableState.errorMessage).toBe(
        "Database temporarily locked",
      ),
    );
    expect(result.current.tableState.allVisibleChecked).toBe(false);

    failHistory = false;
    act(() => {
      result.current.tableState.onRetry();
    });
    await waitFor(() => expect(result.current.tableState.runs).toHaveLength(2));
    expect(result.current.tableState.errorMessage).toBeNull();

    act(() => {
      result.current.tableState.onToggleCheck(r1);
    });
    expect(result.current.checkedCount).toBe(1);
    expect(result.current.tableState.allVisibleChecked).toBe(false);

    act(() => {
      result.current.tableState.onToggleAllVisible();
    });
    expect(result.current.checkedCount).toBe(2);
    expect(result.current.tableState.allVisibleChecked).toBe(true);
    expect(result.current.compareSelectedHref).toBe(
      "/lighthouse/compare?runs=run-1%2Crun-2&baseline=run-2",
    );

    act(() => {
      result.current.tableState.onToggleAllVisible();
    });
    expect(result.current.checkedCount).toBe(0);

    act(() => {
      result.current.tableState.onToggleCheck(r1);
      result.current.tableState.onToggleCheck(r2);
      result.current.tableState.onToggleCheck(r1);
    });
    expect(result.current.checkedCount).toBe(1);

    act(() => {
      result.current.onClearChecked();
    });
    expect(result.current.checkedCount).toBe(0);

    unmount();
    client.clear();
  });

  it("exposes isPlaceholderData as true while a filtered query is pending", async () => {
    let resolveFiltered: ((res: Response) => void) | null = null;
    const fetchMock = vi.fn((input: string) => {
      if (input.includes("search=checkout")) {
        return new Promise<Response>((resolve) => {
          resolveFiltered = resolve;
        });
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            runs: [r1, r2],
            total: 41,
            limit: 20,
            offset: 0,
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useHistoryController(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() =>
      expect(result.current.tableState.isPending).toBe(false),
    );
    expect(result.current.tableState.isPlaceholderData).toBe(false);

    act(() => {
      result.current.filters.onSearchChange({
        target: { value: "checkout" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await waitFor(() =>
      expect(result.current.tableState.isPlaceholderData).toBe(true),
    );

    await act(async () => {
      resolveFiltered?.(
        new Response(
          JSON.stringify({
            runs: [r2],
            total: 1,
            limit: 20,
            offset: 0,
          }),
          { status: 200 },
        ),
      );
    });

    await waitFor(() =>
      expect(result.current.tableState.isPlaceholderData).toBe(false),
    );
    expect(result.current.total).toBe(1);

    unmount();
    client.clear();
  });
});
