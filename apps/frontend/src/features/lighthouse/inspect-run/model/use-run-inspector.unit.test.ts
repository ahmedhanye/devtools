import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRunInspector } from "./use-run-inspector";

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe("useRunInspector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resets tab to summary when runId changes and exposes fallback description", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result, rerender } = renderHook(
      ({ runId }: { runId: string | null }) => useRunInspector(runId),
      {
        initialProps: { runId: null as string | null },
        wrapper: createWrapper(client),
      },
    );

    expect(result.current.descriptionText).toBe(
      "Select an Audit Run to inspect",
    );
    expect(result.current.activeTab).toBe("summary");

    rerender({ runId: "12345678-aaaa-bbbb-cccc-1234567890ab" });
    expect(result.current.descriptionText).toContain("12345678");

    act(() => {
      result.current.handleTabChange("report");
    });
    expect(result.current.activeTab).toBe("report");

    act(() => {
      result.current.handleTabChange("ignored");
    });
    expect(result.current.activeTab).toBe("report");

    rerender({ runId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
    expect(result.current.activeTab).toBe("summary");
  });

  it("loads run detail and handles retry cleanly", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "12345678-aaaa-bbbb-cccc-1234567890ab",
            url: "https://shop.example.com/",
            finalUrl: "https://shop.example.com/",
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
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useRunInspector("12345678-aaaa-bbbb-cccc-1234567890ab"),
      { wrapper: createWrapper(client) },
    );

    await waitFor(() =>
      expect(result.current.run?.url).toBe("https://shop.example.com/"),
    );
    expect(result.current.descriptionText).toContain(
      "https://shop.example.com/",
    );

    act(() => {
      result.current.handleRetry();
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
