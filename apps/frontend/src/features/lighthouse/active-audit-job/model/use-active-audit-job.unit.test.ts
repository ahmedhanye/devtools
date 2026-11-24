import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useActiveAuditJob } from "./use-active-audit-job";

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe("useActiveAuditJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null job when no Audit Job is active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ active: false, job: null }), {
            status: 200,
          }),
      ),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useActiveAuditJob(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.job).toBeNull());
  });

  it("computes progress percentage and stage label when an Audit Job is active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              active: true,
              job: {
                id: "job-1",
                url: "https://example.com/",
                formFactor: "mobile",
                throttlingMethod: "simulate",
                runs: 1,
                categories: ["performance"],
                status: "running",
                startedAt: "2026-11-22T02:00:00.000Z",
                completedAt: null,
                latestProgress: {
                  jobId: "job-1",
                  status: "running",
                  stage: "analyzing",
                  message: "Analyzing page performance",
                  runIndex: 1,
                  totalRuns: 1,
                  timestamp: "2026-11-22T02:00:05.000Z",
                },
                runId: null,
                error: null,
              },
            }),
            { status: 200 },
          ),
      ),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useActiveAuditJob(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.job?.id).toBe("job-1"));
    expect(result.current.pct).toBeGreaterThan(0);
    expect(result.current.stageLabel).toBeTruthy();

    const preventDefault = vi.fn();
    result.current.handleNavigate({
      preventDefault,
    } as unknown as React.MouseEvent<HTMLAnchorElement>);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("computes monotonic multi-run percentage across iterations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              active: true,
              job: {
                id: "job-multi",
                url: "https://example.com/",
                formFactor: "mobile",
                throttlingMethod: "simulate",
                runs: 3,
                categories: ["performance"],
                status: "running",
                startedAt: "2026-11-22T02:00:00.000Z",
                completedAt: null,
                latestProgress: {
                  jobId: "job-multi",
                  status: "running",
                  stage: "launching_browser",
                  message: "Launching",
                  runIndex: 1,
                  totalRuns: 3,
                  timestamp: "2026-11-22T02:00:08.000Z",
                },
                runId: null,
                error: null,
              },
            }),
            { status: 200 },
          ),
      ),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useActiveAuditJob(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.job?.id).toBe("job-multi"));
    // Run 2 of 3 launching_browser must be past the 1/3 mark (45%), not reset to 33%
    expect(result.current.pct).toBe(45);
  });
});
