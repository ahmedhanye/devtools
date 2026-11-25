import { createElement, type ReactNode } from "react";
import type {
  AuditJob,
  LighthouseRunDetail,
} from "@devtools/lighthouse/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateNativeSearchParams } from "@/shared/lib";
import { useLiveJobStream } from "./use-live-job-stream";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Set<(event: Event) => void>>();
  readonly url: string;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (event: Event) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(fn);
  }

  removeEventListener(type: string, fn: (event: Event) => void) {
    this.listeners.get(type)?.delete(fn);
  }

  emit(type: string, event: Event) {
    for (const fn of this.listeners.get(type) ?? []) {
      fn(event);
    }
  }

  close() {
    this.closed = true;
  }
}

function makeJob(id = "job-1"): AuditJob {
  return {
    id,
    url: "https://shop.example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    runs: 2,
    categories: ["performance"],
    status: "running",
    startedAt: "2026-11-22T02:00:00.000Z",
    completedAt: null,
    latestProgress: null,
    runId: null,
    error: null,
  };
}

function makeRunDetail(id = "run-99"): LighthouseRunDetail {
  return {
    id,
    url: "https://shop.example.com/",
    finalUrl: "https://shop.example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 94,
    accessibilityScore: 98,
    bestPracticesScore: 96,
    seoScore: 100,
    lcpMs: 1700,
    cls: 0.02,
    tbtMs: 85,
    fcpMs: 910,
    siMs: 1400,
    ttfbMs: 210,
    durationMs: 3600,
    createdAt: "2026-11-22T02:01:00.000Z",
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
  };
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe("useLiveJobStream", () => {
  const originalHref = window.location.href;

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    updateNativeSearchParams("?job=job-1", { replace: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", originalHref);
  });

  it("streams progress and transitions URL to completed run", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ active: true, job: makeJob() }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.activeJob?.id).toBe("job-1"));
    const source = FakeEventSource.instances[0]!;

    act(() => {
      source.emit(
        "progress",
        new MessageEvent("progress", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "running",
            stage: "navigating",
            message: "Navigating",
            timestamp: "2026-11-22T02:00:05.000Z",
          }),
        }),
      );
    });
    expect(result.current.latestProgress?.stage).toBe("navigating");
    const cachedActive = client.getQueryData<{
      active: boolean;
      job: AuditJob | null;
    }>(["lighthouse", "active-job"]);
    expect(cachedActive?.active).toBe(true);
    expect(cachedActive?.job?.latestProgress?.stage).toBe("navigating");

    const run = makeRunDetail("run-99");
    act(() => {
      source.emit(
        "complete",
        new MessageEvent("complete", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "completed",
            runId: "run-99",
            run,
          }),
        }),
      );
    });

    expect(result.current.isCompleting).toBe(true);
    expect(client.getQueryData(["lighthouse", "run", "run-99"])).toEqual(run);
    await waitFor(() => expect(window.location.search).toBe("?id=run-99"));
    unmount();
    client.clear();
  });

  it("cancels pending completion settle timer when unmounted before settle finishes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ active: true, job: makeJob() }), {
            status: 200,
          }),
      ),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await Promise.resolve();
    });
    const source = FakeEventSource.instances[0]!;

    act(() => {
      source.emit(
        "complete",
        new MessageEvent("complete", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "completed",
            runId: "run-99",
            run: makeRunDetail("run-99"),
          }),
        }),
      );
    });
    expect(result.current.isCompleting).toBe(true);
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(window.location.search).toBe("?job=job-1");
    client.clear();
  });

  it("surfaces structured SSE error events without marking expired", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ active: true, job: makeJob() }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    const source = FakeEventSource.instances[0]!;
    act(() => {
      source.emit(
        "error",
        new MessageEvent("error", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "failed",
            error: { code: "AUDIT_FAILED", message: "Chrome crashed" },
          }),
        }),
      );
    });

    expect(result.current.sseError).toEqual({
      code: "AUDIT_FAILED",
      message: "Chrome crashed",
    });
    expect(result.current.isExpired).toBe(false);
    unmount();
    client.clear();
  });

  it("marks expired immediately when job is inactive and never seen active", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ active: false, job: null }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-gone"), {
      wrapper: createWrapper(client),
    });

    const source = FakeEventSource.instances[0]!;
    await act(async () => {
      source.emit("error", new Event("error"));
    });

    await waitFor(() => expect(result.current.isExpired).toBe(true));
    expect(FakeEventSource.instances).toHaveLength(1);
    unmount();
    client.clear();
  });

  it("reconnects with backoff after transient SSE drop while job remains active and completes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ active: true, job: makeJob() }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.activeJob?.id).toBe("job-1");
    expect(FakeEventSource.instances).toHaveLength(1);

    await act(async () => {
      FakeEventSource.instances[0]!.emit("error", new Event("error"));
    });
    expect(result.current.isExpired).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(FakeEventSource.instances).toHaveLength(2);

    act(() => {
      FakeEventSource.instances[1]!.emit(
        "progress",
        new MessageEvent("progress", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "running",
            stage: "analyzing",
            message: "Analyzing",
            timestamp: "2026-11-22T02:00:08.000Z",
          }),
        }),
      );
      FakeEventSource.instances[1]!.emit(
        "complete",
        new MessageEvent("complete", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "completed",
            runId: "run-99",
            run: makeRunDetail("run-99"),
          }),
        }),
      );
    });

    expect(result.current.isCompleting).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(window.location.search).toBe("?id=run-99");
    expect(result.current.isExpired).toBe(false);
    unmount();
    client.clear();
  });

  it("performs automatic final stream check when polling reports inactive after exhausted retries", async () => {
    vi.useFakeTimers();
    let active = true;
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            active
              ? { active: true, job: makeJob() }
              : { active: false, job: null },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.activeJob?.id).toBe("job-1");

    const backoffDelays = [250, 500, 1000, 2000];
    for (const [idx, delay] of backoffDelays.entries()) {
      await act(async () => {
        FakeEventSource.instances[idx]!.emit("error", new Event("error"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay);
      });
    }

    await act(async () => {
      FakeEventSource.instances[4]!.emit("error", new Event("error"));
    });
    expect(FakeEventSource.instances).toHaveLength(5);
    expect(result.current.isStreamDisconnected).toBe(true);

    active = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(FakeEventSource.instances).toHaveLength(6);
    expect(result.current.isExpired).toBe(false);

    act(() => {
      FakeEventSource.instances[5]!.emit(
        "complete",
        new MessageEvent("complete", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "completed",
            runId: "run-99",
            run: makeRunDetail("run-99"),
          }),
        }),
      );
    });

    expect(result.current.isCompleting).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(window.location.search).toBe("?id=run-99");
    unmount();
    client.clear();
  });

  it("re-opens stream and clears disconnected state on manual reconnect", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ active: true, job: makeJob() }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.activeJob?.id).toBe("job-1");

    const backoffDelays = [250, 500, 1000, 2000];
    for (const [idx, delay] of backoffDelays.entries()) {
      await act(async () => {
        FakeEventSource.instances[idx]!.emit("error", new Event("error"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay);
      });
    }

    await act(async () => {
      FakeEventSource.instances[4]!.emit("error", new Event("error"));
    });
    expect(FakeEventSource.instances).toHaveLength(5);
    expect(result.current.isStreamDisconnected).toBe(true);

    act(() => {
      result.current.handleReconnect();
    });
    expect(result.current.isStreamDisconnected).toBe(false);
    expect(FakeEventSource.instances).toHaveLength(6);

    unmount();
    client.clear();
  });

  it("marks sawActive on SSE progress even if REST active-job poll has not returned active", async () => {
    let active = false;
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            active
              ? { active: true, job: makeJob() }
              : { active: false, job: null },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => {
      FakeEventSource.instances[0]!.emit(
        "progress",
        new MessageEvent("progress", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "running",
            stage: "analyzing",
            message: "Analyzing",
            timestamp: "2026-11-22T02:00:05.000Z",
          }),
        }),
      );
    });

    await act(async () => {
      FakeEventSource.instances[0]!.emit("error", new Event("error"));
    });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    expect(result.current.isExpired).toBe(false);

    unmount();
    client.clear();
  });

  it("recovers via final stream check when job finishes right before onConnectionError refetch, or expires if final check fails", async () => {
    let active = true;
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            active
              ? { active: true, job: makeJob() }
              : { active: false, job: null },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.activeJob?.id).toBe("job-1"));

    active = false;
    await act(async () => {
      FakeEventSource.instances[0]!.emit("error", new Event("error"));
    });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    expect(result.current.isExpired).toBe(false);

    await act(async () => {
      FakeEventSource.instances[1]!.emit("error", new Event("error"));
    });
    await waitFor(() => expect(result.current.isExpired).toBe(true));

    unmount();
    client.clear();
  });

  it("cancels pending backoff timer when active job transitions inactive and cleans up on unmount", async () => {
    vi.useFakeTimers();
    let active = true;
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            active
              ? { active: true, job: makeJob() }
              : { active: false, job: null },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.activeJob?.id).toBe("job-1");

    await act(async () => {
      FakeEventSource.instances[0]!.emit("error", new Event("error"));
    });

    active = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: ["lighthouse", "active-job"],
      });
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(FakeEventSource.instances).toHaveLength(2);

    unmount();
    expect(FakeEventSource.instances[1]!.closed).toBe(true);
    client.clear();
  });

  it("ignores connection drop refetch result if unmounted while refetch is pending", async () => {
    let resolveRefetch: ((res: Response) => void) | null = null;
    let callCount = 0;
    const fetchMock = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ active: true, job: makeJob() }), {
            status: 200,
          }),
        );
      }
      return new Promise<Response>((resolve) => {
        resolveRefetch = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.activeJob?.id).toBe("job-1"));

    act(() => {
      FakeEventSource.instances[0]!.emit("error", new Event("error"));
    });

    unmount();

    await act(async () => {
      resolveRefetch?.(
        new Response(JSON.stringify({ active: false, job: null }), {
          status: 200,
        }),
      );
    });

    expect(FakeEventSource.instances).toHaveLength(1);
    client.clear();
  });

  it("leaves active-job cache unchanged on progress when inactive or for a different job", async () => {
    const otherJob = makeJob("job-other");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ active: true, job: otherJob }), {
            status: 200,
          }),
      ),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await waitFor(() =>
      expect(
        client.getQueryData<{ active: boolean; job: AuditJob | null }>([
          "lighthouse",
          "active-job",
        ])?.job?.id,
      ).toBe("job-other"),
    );

    act(() => {
      FakeEventSource.instances[0]!.emit(
        "progress",
        new MessageEvent("progress", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "running",
            stage: "navigating",
            message: "Navigating",
            timestamp: "2026-11-22T02:00:05.000Z",
          }),
        }),
      );
    });

    expect(result.current.latestProgress?.stage).toBe("navigating");
    expect(
      client.getQueryData<{ active: boolean; job: AuditJob | null }>([
        "lighthouse",
        "active-job",
      ])?.job?.latestProgress,
    ).toBeNull();

    unmount();
    client.clear();
  });

  it("keeps newer polled progress when an older delayed SSE progress event arrives", async () => {
    const jobWithNewerProgress: AuditJob = {
      ...makeJob(),
      latestProgress: {
        jobId: "job-1",
        status: "running",
        stage: "analyzing",
        message: "Analyzing traces",
        timestamp: "2026-11-22T02:00:12.000Z",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ active: true, job: jobWithNewerProgress }),
            { status: 200 },
          ),
      ),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.activeJob?.id).toBe("job-1"));

    act(() => {
      FakeEventSource.instances[0]!.emit(
        "progress",
        new MessageEvent("progress", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "running",
            stage: "navigating",
            message: "Navigating",
            timestamp: "2026-11-22T02:00:04.000Z",
          }),
        }),
      );
    });

    expect(
      client.getQueryData<{ active: boolean; job: AuditJob | null }>([
        "lighthouse",
        "active-job",
      ])?.job?.latestProgress?.stage,
    ).toBe("analyzing");

    act(() => {
      FakeEventSource.instances[0]!.emit(
        "progress",
        new MessageEvent("progress", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "running",
            stage: "generating_report",
            message: "Generating report",
            timestamp: "2026-11-22T02:00:15.000Z",
          }),
        }),
      );
      FakeEventSource.instances[0]!.emit(
        "progress",
        new MessageEvent("progress", {
          data: JSON.stringify({
            jobId: "job-1",
            status: "running",
            stage: "navigating",
            message: "Delayed navigating",
            timestamp: "2026-11-22T02:00:06.000Z",
          }),
        }),
      );
    });

    expect(result.current.latestProgress?.stage).toBe("generating_report");
    expect(
      client.getQueryData<{ active: boolean; job: AuditJob | null }>([
        "lighthouse",
        "active-job",
      ])?.job?.latestProgress?.stage,
    ).toBe("generating_report");

    unmount();
    client.clear();
  });

  it("retries and enters disconnected state instead of expired when active-job refetch fails", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () => new Response("Service unavailable", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result, unmount } = renderHook(() => useLiveJobStream("job-1"), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const backoffDelays = [250, 500, 1000, 2000];
    for (const [idx, delay] of backoffDelays.entries()) {
      await act(async () => {
        FakeEventSource.instances[idx]!.emit("error", new Event("error"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay);
      });
    }

    await act(async () => {
      FakeEventSource.instances[4]!.emit("error", new Event("error"));
    });

    expect(FakeEventSource.instances).toHaveLength(5);
    expect(result.current.isExpired).toBe(false);
    expect(result.current.isStreamDisconnected).toBe(true);

    unmount();
    client.clear();
  });
});
