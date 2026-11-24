import type * as React from "react";
import { useEffect, useState } from "react";
import type { LighthouseRunDetail } from "@devtools/lighthouse/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { updateNativeSearchParams } from "@/shared/lib";
import { RunPage } from "./page";

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly listeners = new Map<string, Set<(event: Event) => void>>();
  readonly url: string;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
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

function RunProviders({
  handler,
  initialSearch,
  children,
}: {
  handler: FetchHandler;
  initialSearch: string;
  children: React.ReactNode;
}) {
  const [state] = useState(() => {
    MockEventSource.instances = [];
    const previousFetch = globalThis.fetch;
    const previousEventSource = globalThis.EventSource;
    const previousSearch = window.location.search;
    updateNativeSearchParams(initialSearch, { replace: true });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const stubFetch: typeof fetch = Object.assign(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        return handler(url, init);
      },
      { preconnect: previousFetch.preconnect },
    );
    globalThis.fetch = stubFetch;
    Object.defineProperty(globalThis, "EventSource", {
      value: MockEventSource,
      writable: true,
      configurable: true,
    });
    return {
      client,
      previousFetch,
      stubFetch,
      previousEventSource,
      previousSearch,
    };
  });

  useEffect(() => {
    return () => {
      if (globalThis.fetch === state.stubFetch) {
        globalThis.fetch = state.previousFetch;
      }
      Object.defineProperty(globalThis, "EventSource", {
        value: state.previousEventSource,
        writable: true,
        configurable: true,
      });
      updateNativeSearchParams(state.previousSearch, { replace: true });
      state.client.clear();
    };
  }, [state]);

  return (
    <QueryClientProvider client={state.client}>{children}</QueryClientProvider>
  );
}

const SAMPLE_DETAIL: LighthouseRunDetail = {
  id: "run-detail-1",
  url: "https://shop.example.com/",
  finalUrl: "https://shop.example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  performanceScore: 91,
  accessibilityScore: 97,
  bestPracticesScore: 95,
  seoScore: 100,
  lcpMs: 1900,
  cls: 0.03,
  tbtMs: 95,
  fcpMs: 980,
  siMs: 1550,
  ttfbMs: 220,
  durationMs: 4100,
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
};

const PREVIOUS_SAME_URL_RUN: LighthouseRunDetail = {
  ...SAMPLE_DETAIL,
  id: "run-prev-0",
  createdAt: "2026-11-21T02:00:00.000Z",
};

function toListItem(detail: LighthouseRunDetail) {
  const { summary: _summary, ...rest } = detail;
  return rest;
}

function makeDetailHandler(detail: LighthouseRunDetail): FetchHandler {
  return async (rawUrl: string) => {
    if (rawUrl === `/api/lighthouse/runs/${detail.id}`) {
      return new Response(JSON.stringify(detail), { status: 200 });
    }
    if (rawUrl.startsWith("/api/lighthouse/runs")) {
      return new Response(
        JSON.stringify({
          runs: [toListItem(detail), toListItem(PREVIOUS_SAME_URL_RUN)],
          total: 2,
          limit: 100,
          offset: 0,
        }),
        { status: 200 },
      );
    }
    return new Response(null, { status: 404 });
  };
}

const detailHandler = makeDetailHandler(SAMPLE_DETAIL);

const activeStreamHandler: FetchHandler = async (rawUrl: string) => {
  if (rawUrl === "/api/lighthouse/audits/active") {
    return new Response(
      JSON.stringify({
        active: true,
        job: {
          id: "job-stream-1",
          url: "https://shop.example.com/",
          formFactor: "mobile",
          throttlingMethod: "simulate",
          runs: 3,
          categories: ["performance"],
          status: "running",
          startedAt: "2026-11-22T02:00:00.000Z",
          completedAt: null,
          latestProgress: null,
          runId: null,
          error: null,
        },
      }),
      { status: 200 },
    );
  }
  return detailHandler(rawUrl);
};

const expiredJobHandler: FetchHandler = async () =>
  new Response(JSON.stringify({ active: false, job: null }), { status: 200 });

const noopHandler: FetchHandler = async () =>
  new Response(null, { status: 404 });

const meta: Meta<typeof RunPage> = {
  title: "Pages/Lighthouse/RunPage",
  component: RunPage,
  tags: ["autodocs"],
  parameters: {
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof RunPage>;

export const RunDetailAndTabSync: Story = {
  render: () => (
    <RunProviders handler={detailHandler} initialSearch="?id=run-detail-1">
      <RunPage />
    </RunProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("https://shop.example.com/"),
    ).toBeInTheDocument();

    const compareLink = canvas.getByRole("link", { name: "Compare Run" });
    await waitFor(async () => {
      await expect(compareLink).toHaveAttribute(
        "href",
        "/lighthouse/compare?runs=run-prev-0%2Crun-detail-1&baseline=run-prev-0",
      );
    });

    await userEvent.click(canvas.getByRole("tab", { name: "HTML Report" }));
    await expect(
      await canvas.findByText("HTML Report Artifact unavailable"),
    ).toBeInTheDocument();
    await expect(window.location.search).toContain("tab=report");

    await userEvent.click(canvas.getByRole("tab", { name: "Audit Summary" }));
    await expect(window.location.search).toBe("?id=run-detail-1");
  },
};

export const LiveJobStreamsToCompleteDetail: Story = {
  render: () => (
    <RunProviders
      handler={activeStreamHandler}
      initialSearch="?job=job-stream-1"
    >
      <RunPage />
    </RunProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const targetLink = await canvas.findByRole("link", {
      name: "shop.example.com",
    });
    await expect(targetLink).toHaveAttribute(
      "href",
      "https://shop.example.com/",
    );
    await expect(canvas.queryByText(/Live Audit Job/)).not.toBeInTheDocument();

    const source = MockEventSource.instances[0];
    if (!source) throw new Error("Expected MockEventSource instance");

    source.emit(
      "progress",
      new MessageEvent("progress", {
        data: JSON.stringify({
          jobId: "job-stream-1",
          status: "running",
          stage: "analyzing",
          message: "Analyzing traces",
          runIndex: 1,
          totalRuns: 3,
          timestamp: "2026-11-22T02:00:05.000Z",
        }),
      }),
    );

    await expect(
      await canvas.findByText(/Analyzing traces \(Iteration 2 of 3\)/),
    ).toBeInTheDocument();

    const iter1Toggle = canvas.getByRole("button", {
      name: /Iteration 1 of 3/i,
    });
    await userEvent.click(iter1Toggle);
    await expect(iter1Toggle).toHaveAttribute("aria-expanded", "true");

    source.emit(
      "complete",
      new MessageEvent("complete", {
        data: JSON.stringify({
          jobId: "job-stream-1",
          status: "completed",
          runId: "run-detail-1",
          run: SAMPLE_DETAIL,
        }),
      }),
    );

    await expect(
      await canvas.findByText("Category Scores"),
    ).toBeInTheDocument();
    await expect(window.location.search).toBe("?id=run-detail-1");
  },
};

export const LiveJobSseError: Story = {
  render: () => (
    <RunProviders handler={activeStreamHandler} initialSearch="?job=job-fail-1">
      <RunPage />
    </RunProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const source = MockEventSource.instances[0];
    if (!source) throw new Error("Expected MockEventSource instance");

    source.emit(
      "error",
      new MessageEvent("error", {
        data: JSON.stringify({
          jobId: "job-fail-1",
          status: "failed",
          error: {
            code: "AUDIT_FAILED",
            message: "Browser exited unexpectedly",
          },
        }),
      }),
    );

    await expect(
      await canvas.findByText("Audit Job Failed (AUDIT_FAILED)"),
    ).toBeInTheDocument();
  },
};

export const ExpiredJobFallback: Story = {
  render: () => (
    <RunProviders handler={expiredJobHandler} initialSearch="?job=job-gone-1">
      <RunPage />
    </RunProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const source = MockEventSource.instances[0];
    if (!source) throw new Error("Expected MockEventSource instance");

    source.emit("error", new Event("error"));
    await expect(
      await canvas.findByText("Audit Job not found or expired"),
    ).toBeInTheDocument();
  },
};

export const MissingQueryParams: Story = {
  render: () => (
    <RunProviders handler={noopHandler} initialSearch="">
      <RunPage />
    </RunProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("No Audit Run or Audit Job selected"),
    ).toBeInTheDocument();
  },
};

export const RunDetailWithHtmlReportTab: Story = {
  render: () => {
    const detailWithReport: LighthouseRunDetail = {
      ...SAMPLE_DETAIL,
      id: "run-report-1",
      hasHtmlReport: true,
    };
    return (
      <RunProviders
        handler={makeDetailHandler(detailWithReport)}
        initialSearch="?id=run-report-1&tab=report"
      >
        <RunPage />
      </RunProviders>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frame = await canvas.findByTitle("Lighthouse HTML Report");
    await expect(frame).toHaveAttribute(
      "src",
      "/api/lighthouse/runs/run-report-1/report",
    );
    await expect(frame).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-popups allow-downloads",
    );
    const reportWindowLinks = canvas.getAllByRole("link", {
      name: "New Window",
    });
    await expect(
      reportWindowLinks.some(
        (link) =>
          link.getAttribute("href") ===
          "/api/lighthouse/runs/run-report-1/report",
      ),
    ).toBe(true);
  },
};

export const TransientSseDropRecoversAndCompletes: Story = {
  render: () => {
    let jobActive = true;
    const handler: FetchHandler = async (rawUrl) => {
      if (rawUrl === "/api/lighthouse/audits/active") {
        return new Response(
          JSON.stringify(
            jobActive
              ? {
                  active: true,
                  job: {
                    id: "job-recover-1",
                    url: "https://shop.example.com/pricing?plan=pro",
                    formFactor: "mobile",
                    throttlingMethod: "simulate",
                    runs: 1,
                    categories: ["performance"],
                    status: "running",
                    startedAt: "2026-11-22T02:00:00.000Z",
                    completedAt: null,
                    latestProgress: null,
                    runId: null,
                    error: null,
                  },
                }
              : { active: false, job: null },
          ),
          { status: 200 },
        );
      }
      if (rawUrl === "/api/lighthouse/audits/job-recover-1/mark-inactive") {
        jobActive = false;
      }
      return detailHandler(rawUrl);
    };
    const wrappedHandler: FetchHandler = async (rawUrl) => {
      const response = await handler(rawUrl);
      if (rawUrl === "/api/lighthouse/audits/active" && jobActive) {
        jobActive = false;
      }
      return response;
    };
    return (
      <RunProviders handler={wrappedHandler} initialSearch="?job=job-recover-1">
        <RunPage />
      </RunProviders>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const targetLink = await canvas.findByRole("link", {
      name: "shop.example.com",
    });
    await expect(targetLink).toHaveAttribute(
      "href",
      "https://shop.example.com/pricing?plan=pro",
    );
    await expect(
      await canvas.findByText("/pricing?plan=pro"),
    ).toBeInTheDocument();

    const firstSource = MockEventSource.instances[0];
    if (!firstSource) throw new Error("Expected initial MockEventSource");
    firstSource.emit("error", new Event("error"));

    const recoverySource = await waitFor(() => {
      const next = MockEventSource.instances[1];
      if (!next) throw new Error("Expected recovery MockEventSource");
      return next;
    });
    await expect(
      canvas.queryByText("Audit Job not found or expired"),
    ).not.toBeInTheDocument();

    recoverySource.emit(
      "complete",
      new MessageEvent("complete", {
        data: JSON.stringify({
          jobId: "job-recover-1",
          status: "completed",
          runId: "run-detail-1",
          run: SAMPLE_DETAIL,
        }),
      }),
    );

    await expect(
      await canvas.findByText("Category Scores"),
    ).toBeInTheDocument();
    await expect(window.location.search).toBe("?id=run-detail-1");
  },
};

export const RunErrorRetryAndRerun: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/lighthouse/run" },
    },
  },
  render: () => {
    let attempts = 0;
    let rerunTriggered = false;
    const handler: FetchHandler = async (rawUrl: string, init) => {
      if (rawUrl === "/api/lighthouse/audits" && init?.method === "POST") {
        rerunTriggered = true;
        return new Response(
          JSON.stringify({
            job: {
              id: "job-rerun-1",
              url: "https://shop.example.com/",
              formFactor: "mobile",
              throttlingMethod: "simulate",
              runs: 1,
              categories: ["performance"],
              status: "running",
              startedAt: "2026-11-22T02:05:00.000Z",
              completedAt: null,
              latestProgress: null,
              runId: null,
              error: null,
            },
          }),
          { status: 202 },
        );
      }
      if (rawUrl === "/api/lighthouse/audits/active") {
        return new Response(
          JSON.stringify(
            rerunTriggered
              ? {
                  active: true,
                  job: {
                    id: "job-rerun-1",
                    url: "https://shop.example.com/",
                    formFactor: "mobile",
                    throttlingMethod: "simulate",
                    runs: 1,
                    categories: ["performance"],
                    status: "running",
                    startedAt: "2026-11-22T02:05:00.000Z",
                    completedAt: null,
                    latestProgress: null,
                    runId: null,
                    error: null,
                  },
                }
              : { active: false, job: null },
          ),
          { status: 200 },
        );
      }
      if (rawUrl === `/api/lighthouse/runs/${SAMPLE_DETAIL.id}`) {
        attempts += 1;
        if (attempts === 1) {
          return new Response(
            JSON.stringify({
              error: {
                code: "INTERNAL",
                message: "Run store temporary failure",
              },
            }),
            { status: 500 },
          );
        }
      }
      return detailHandler(rawUrl);
    };
    return (
      <RunProviders handler={handler} initialSearch="?id=run-detail-1">
        <RunPage />
      </RunProviders>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Unable to load Audit Run"),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(
      await canvas.findByText("https://shop.example.com/"),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Re-run" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByText("New Lighthouse Audit"),
    ).toBeInTheDocument();
    await userEvent.click(
      await body.findByRole("button", { name: "Run Lighthouse Audit" }),
    );
    const rerunTargetLink = await canvas.findByRole("link", {
      name: "shop.example.com",
    });
    await expect(rerunTargetLink).toHaveAttribute(
      "href",
      "https://shop.example.com/",
    );
    await expect(window.location.search).toBe("?job=job-rerun-1");
  },
};
