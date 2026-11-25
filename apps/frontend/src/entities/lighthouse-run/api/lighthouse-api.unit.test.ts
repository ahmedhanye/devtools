import type { LighthouseRunDetail } from "@devtools/lighthouse/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/shared/api";
import {
  buildLighthouseRunsQueryString,
  getActiveAuditJob,
  getLighthouseDiff,
  getLighthouseReportUrl,
  getLighthouseRun,
  listLighthouseRuns,
  subscribeToAuditJob,
  triggerLighthouseAudit,
} from "./lighthouse-api";

function makeRunDetail(id = "run-1"): LighthouseRunDetail {
  return {
    id,
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 92,
    accessibilityScore: 96,
    bestPracticesScore: 95,
    seoScore: 100,
    lcpMs: 1800,
    cls: 0.02,
    tbtMs: 90,
    fcpMs: 950,
    siMs: 1400,
    ttfbMs: 240,
    durationMs: 3200,
    createdAt: "2026-11-22T01:00:00.000Z",
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

function makeJob(id = "job-1") {
  return {
    id,
    url: "https://example.com/",
    formFactor: "mobile" as const,
    throttlingMethod: "simulate" as const,
    runs: 1,
    categories: ["performance" as const],
    status: "running" as const,
    startedAt: "2026-11-22T01:00:00.000Z",
    completedAt: null,
    latestProgress: null,
    runId: null,
    error: null,
  };
}

describe("lighthouse-api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds run list query strings and fetches paginated runs", async () => {
    expect(buildLighthouseRunsQueryString()).toBe("");
    expect(
      buildLighthouseRunsQueryString({
        url: "https://example.com/",
        search: "example",
        formFactor: "desktop",
        throttlingMethod: "devtools",
        limit: 25,
        offset: 50,
      }),
    ).toBe(
      "url=https%3A%2F%2Fexample.com%2F&search=example&formFactor=desktop&throttlingMethod=devtools&limit=25&offset=50",
    );

    const run = makeRunDetail("run-1");
    const responseBody = JSON.stringify({
      runs: [
        {
          ...run,
          summary: undefined,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(responseBody, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const emptyQueryRes = await listLighthouseRuns();
    expect(emptyQueryRes.total).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lighthouse/runs",
      expect.any(Object),
    );

    await listLighthouseRuns({ search: "shop", formFactor: "mobile" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lighthouse/runs?search=shop&formFactor=mobile",
      expect.any(Object),
    );
  });

  it("fetches run details, diffs, active jobs, triggers audits, and resolves report URLs", async () => {
    const run1 = makeRunDetail("run/1");
    const run2 = makeRunDetail("run-2");
    const job = makeJob("job-1");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(run1), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            baseline: run1,
            comparison: run2,
            deltas: {
              scores: {
                performanceScore: 0,
                accessibilityScore: 0,
                bestPracticesScore: 0,
                seoScore: 0,
              },
              metrics: {
                lcpMs: 0,
                cls: 0,
                tbtMs: 0,
                fcpMs: 0,
                siMs: 0,
                ttfbMs: 0,
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
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ active: true, job }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job }), { status: 202 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "An audit job is already in progress",
              details: { activeJobId: "job-1" },
            },
          }),
          { status: 409 },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    expect((await getLighthouseRun("run/1")).id).toBe("run/1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/lighthouse/runs/run%2F1",
      expect.any(Object),
    );

    const diff = await getLighthouseDiff("run/1", "run-2");
    expect(diff.comparison.id).toBe("run-2");

    const active = await getActiveAuditJob();
    expect(active.active).toBe(true);

    const triggered = await triggerLighthouseAudit({
      url: "https://example.com/",
      formFactor: "mobile",
    });
    expect(triggered.job.id).toBe("job-1");

    await expect(
      triggerLighthouseAudit({ url: "https://example.com/" }),
    ).rejects.toBeInstanceOf(ApiRequestError);

    expect(getLighthouseReportUrl("run/1")).toBe(
      "/api/lighthouse/runs/run%2F1/report",
    );
  });

  it("subscribes to Audit Job SSE events and handles lifecycle transitions", () => {
    class FakeEventSource {
      static latest: FakeEventSource | null = null;
      readonly listeners = new Map<string, Set<(event: Event) => void>>();
      readonly url: string;
      closed = false;
      constructor(url: string) {
        this.url = url;
        FakeEventSource.latest = this;
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

    vi.stubGlobal("EventSource", FakeEventSource);

    const onProgress = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const onConnectionError = vi.fn();

    const unsub1 = subscribeToAuditJob("job-1", {
      onProgress,
      onComplete,
      onError,
      onConnectionError,
    });
    const es1 = FakeEventSource.latest!;
    expect(es1.url).toBe("/api/lighthouse/audits/job-1/stream");

    es1.emit("progress", new Event("progress"));
    es1.emit("progress", new MessageEvent("progress", { data: "{bad-json" }));
    es1.emit(
      "progress",
      new MessageEvent("progress", {
        data: JSON.stringify({
          jobId: "job-1",
          status: "running",
          stage: "navigating",
          message: "Navigating",
          timestamp: "2026-11-22T01:00:01.000Z",
        }),
      }),
    );
    expect(onProgress).toHaveBeenCalledTimes(1);

    es1.emit("complete", new Event("complete"));
    es1.emit(
      "complete",
      new MessageEvent("complete", {
        data: JSON.stringify({
          jobId: "job-1",
          status: "completed",
          runId: "run-1",
          run: makeRunDetail("run-1"),
        }),
      }),
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(es1.closed).toBe(true);
    unsub1();

    subscribeToAuditJob("job-2", { onComplete, onConnectionError });
    const es2 = FakeEventSource.latest!;
    es2.emit("complete", new MessageEvent("complete", { data: "not-json" }));
    expect(onConnectionError).toHaveBeenCalledTimes(1);

    subscribeToAuditJob("job-2b", { onConnectionError });
    const es2b = FakeEventSource.latest!;
    es2b.emit(
      "complete",
      new MessageEvent("complete", { data: JSON.stringify({ bad: true }) }),
    );
    expect(onConnectionError).toHaveBeenCalledTimes(2);

    subscribeToAuditJob("job-3", { onError, onConnectionError });
    const es3 = FakeEventSource.latest!;
    es3.emit("error", new Event("error"));
    expect(onConnectionError).toHaveBeenCalledTimes(3);

    subscribeToAuditJob("job-4", { onError, onConnectionError });
    const es4 = FakeEventSource.latest!;
    es4.emit(
      "error",
      new MessageEvent("error", {
        data: JSON.stringify({
          jobId: "job-4",
          status: "failed",
          error: { code: "AUDIT_FAILED", message: "Chrome crashed" },
        }),
      }),
    );
    expect(onError).toHaveBeenCalledTimes(1);

    subscribeToAuditJob("job-5", { onConnectionError });
    const es5 = FakeEventSource.latest!;
    es5.emit("error", new MessageEvent("error", { data: "{invalid" }));
    expect(onConnectionError).toHaveBeenCalledTimes(4);

    subscribeToAuditJob("job-6", { onConnectionError });
    const es6 = FakeEventSource.latest!;
    es6.emit(
      "error",
      new MessageEvent("error", { data: JSON.stringify({ bad: true }) }),
    );
    expect(onConnectionError).toHaveBeenCalledTimes(5);

    const preUnsubProgress = vi.fn();
    const preUnsubComplete = vi.fn();
    const preUnsubError = vi.fn();
    const preUnsubConnectionError = vi.fn();
    const unsubBeforeTerminal = subscribeToAuditJob("job-7", {
      onProgress: preUnsubProgress,
      onComplete: preUnsubComplete,
      onError: preUnsubError,
      onConnectionError: preUnsubConnectionError,
    });
    const es7 = FakeEventSource.latest!;
    unsubBeforeTerminal();
    expect(es7.closed).toBe(true);
    expect(es7.listeners.get("progress")?.size).toBe(0);
    expect(es7.listeners.get("complete")?.size).toBe(0);
    expect(es7.listeners.get("error")?.size).toBe(0);

    es7.emit(
      "progress",
      new MessageEvent("progress", {
        data: JSON.stringify({
          jobId: "job-7",
          status: "running",
          stage: "navigating",
          message: "Navigating",
          timestamp: "2026-11-22T01:00:01.000Z",
        }),
      }),
    );
    es7.emit(
      "complete",
      new MessageEvent("complete", {
        data: JSON.stringify({
          jobId: "job-7",
          status: "completed",
          runId: "run-1",
          run: makeRunDetail("run-1"),
        }),
      }),
    );
    es7.emit("error", new Event("error"));
    expect(preUnsubProgress).not.toHaveBeenCalled();
    expect(preUnsubComplete).not.toHaveBeenCalled();
    expect(preUnsubError).not.toHaveBeenCalled();
    expect(preUnsubConnectionError).not.toHaveBeenCalled();
  });

  it("no-ops SSE subscription when EventSource is unavailable", () => {
    vi.stubGlobal("EventSource", undefined);
    const unsub = subscribeToAuditJob("job-ssr", {});
    expect(() => unsub()).not.toThrow();
  });
});
