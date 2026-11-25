import type * as React from "react";
import { useEffect, useState } from "react";
import type {
  LighthouseDiffResponse,
  LighthouseRunDetail,
  LighthouseRunListItem,
} from "@devtools/lighthouse/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { updateNativeSearchParams } from "@/shared/lib";
import { ComparePage } from "./page";

type FetchHandler = (url: string) => Promise<Response>;

function CompareProviders({
  handler,
  initialSearch = "",
  children,
}: {
  handler: FetchHandler;
  initialSearch?: string;
  children: React.ReactNode;
}) {
  const [state] = useState(() => {
    const previousFetch = globalThis.fetch;
    const previousSearch = window.location.search;
    if (initialSearch) {
      updateNativeSearchParams(initialSearch, { replace: true });
    } else {
      updateNativeSearchParams("", { replace: true });
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const stubFetch: typeof fetch = Object.assign(
      (input: Parameters<typeof fetch>[0]) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        return handler(url);
      },
      { preconnect: previousFetch.preconnect },
    );
    globalThis.fetch = stubFetch;
    return { client, previousFetch, stubFetch, previousSearch };
  });

  useEffect(() => {
    return () => {
      if (globalThis.fetch === state.stubFetch) {
        globalThis.fetch = state.previousFetch;
      }
      updateNativeSearchParams(state.previousSearch, { replace: true });
      state.client.clear();
    };
  }, [state]);

  return (
    <QueryClientProvider client={state.client}>{children}</QueryClientProvider>
  );
}

const COMPARE_RUNS: readonly LighthouseRunListItem[] = [
  {
    id: "cmp-run-3",
    url: "https://shop.example.com/",
    finalUrl: "https://shop.example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 93,
    accessibilityScore: 98,
    bestPracticesScore: 96,
    seoScore: 100,
    lcpMs: 1850,
    cls: 0.02,
    tbtMs: 90,
    fcpMs: 920,
    siMs: 1450,
    ttfbMs: 220,
    durationMs: 3900,
    createdAt: "2026-11-22T02:00:00.000Z",
    hasHtmlReport: true,
  },
  {
    id: "cmp-run-2",
    url: "https://shop.example.com/checkout",
    finalUrl: "https://shop.example.com/checkout",
    formFactor: "desktop",
    throttlingMethod: "devtools",
    performanceScore: 81,
    accessibilityScore: 95,
    bestPracticesScore: 92,
    seoScore: 96,
    lcpMs: 2650,
    cls: 0.09,
    tbtMs: 190,
    fcpMs: 1200,
    siMs: 2100,
    ttfbMs: 310,
    durationMs: 4700,
    createdAt: "2026-11-21T16:00:00.000Z",
    hasHtmlReport: true,
  },
  {
    id: "cmp-run-1",
    url: "https://shop.example.com/",
    finalUrl: "https://shop.example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 72,
    accessibilityScore: 92,
    bestPracticesScore: 90,
    seoScore: 95,
    lcpMs: 3450,
    cls: 0.16,
    tbtMs: 310,
    fcpMs: 1550,
    siMs: 2950,
    ttfbMs: 450,
    durationMs: 5300,
    createdAt: "2026-11-20T10:00:00.000Z",
    hasHtmlReport: true,
  },
];

function toRunDetail(run: LighthouseRunListItem): LighthouseRunDetail {
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

function createDiffPayload(
  baseId: string,
  compId: string,
): LighthouseDiffResponse {
  const baseRun = COMPARE_RUNS.find((r) => r.id === baseId) ?? COMPARE_RUNS[2];
  const compRun = COMPARE_RUNS.find((r) => r.id === compId) ?? COMPARE_RUNS[0];
  if (!baseRun || !compRun) {
    throw new Error("Expected baseline and comparison fixture runs");
  }
  return {
    baseline: toRunDetail(baseRun),
    comparison: toRunDetail(compRun),
    deltas: {
      scores: {
        performanceScore:
          (compRun.performanceScore ?? 0) - (baseRun.performanceScore ?? 0),
        accessibilityScore:
          (compRun.accessibilityScore ?? 0) - (baseRun.accessibilityScore ?? 0),
        bestPracticesScore:
          (compRun.bestPracticesScore ?? 0) - (baseRun.bestPracticesScore ?? 0),
        seoScore: (compRun.seoScore ?? 0) - (baseRun.seoScore ?? 0),
      },
      metrics: {
        lcpMs: (compRun.lcpMs ?? 0) - (baseRun.lcpMs ?? 0),
        cls: (compRun.cls ?? 0) - (baseRun.cls ?? 0),
        tbtMs: (compRun.tbtMs ?? 0) - (baseRun.tbtMs ?? 0),
        fcpMs: (compRun.fcpMs ?? 0) - (baseRun.fcpMs ?? 0),
        siMs: (compRun.siMs ?? 0) - (baseRun.siMs ?? 0),
        ttfbMs: (compRun.ttfbMs ?? 0) - (baseRun.ttfbMs ?? 0),
      },
      insights: {
        resolved: [
          { id: "lcp-discovery-insight", title: "Optimize LCP discovery" },
        ],
        regressed: [],
        clsCulpritDelta: -1,
      },
    },
  };
}

function createCompareFetchHandler(
  runs: readonly LighthouseRunListItem[],
): FetchHandler {
  return async (rawUrl: string) => {
    if (rawUrl.startsWith("/api/lighthouse/jobs/active")) {
      return new Response(JSON.stringify({ job: null }), { status: 200 });
    }
    if (rawUrl.startsWith("/api/lighthouse/diff")) {
      const parsed = new URL(rawUrl, "http://localhost");
      const baseline = parsed.searchParams.get("baseline") ?? "";
      const comparison = parsed.searchParams.get("comparison") ?? "";
      return new Response(
        JSON.stringify(createDiffPayload(baseline, comparison)),
        { status: 200 },
      );
    }
    if (rawUrl.startsWith("/api/lighthouse/runs/")) {
      const id = decodeURIComponent(
        rawUrl.slice("/api/lighthouse/runs/".length),
      );
      const run = COMPARE_RUNS.find((r) => r.id === id);
      if (run) {
        return new Response(JSON.stringify(toRunDetail(run)), { status: 200 });
      }
      if (id === "extra-missing-run" && COMPARE_RUNS[2]) {
        return new Response(
          JSON.stringify(toRunDetail({ ...COMPARE_RUNS[2], id })),
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    }
    return new Response(
      JSON.stringify({
        runs,
        total: runs.length,
        limit: 100,
        offset: 0,
      }),
      { status: 200 },
    );
  };
}

const populatedCompareHandler = createCompareFetchHandler(COMPARE_RUNS);
const emptyCompareHandler = createCompareFetchHandler([]);

const meta: Meta<typeof ComparePage> = {
  title: "Pages/Lighthouse/ComparePage",
  component: ComparePage,
  tags: ["autodocs"],
  parameters: {
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof ComparePage>;

export const DefaultAutoSelectAndDiffView: Story = {
  render: () => (
    <CompareProviders handler={populatedCompareHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Comparison Matrix (2 Runs)"),
    ).toBeInTheDocument();

    await expect(
      await canvas.findByText("Optimize LCP discovery"),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "New Audit" }));
    const body = within(document.body);
    await expect(
      await body.findByText("New Lighthouse Audit"),
    ).toBeInTheDocument();
  },
};

export const ChartModeToggles: Story = {
  render: () => (
    <CompareProviders handler={populatedCompareHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Comparison Matrix (2 Runs)"),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("tab", { name: "Bars" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "SEO", pressed: true }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Best Practices", pressed: true }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Accessibility", pressed: true }),
    );
    // Clicking the last remaining chip keeps it active.
    await userEvent.click(
      canvas.getByRole("button", { name: "Performance", pressed: true }),
    );
    await expect(
      canvas.getByRole("button", { name: "Performance", pressed: true }),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "SEO", pressed: false }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Best Practices", pressed: false }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Accessibility", pressed: false }),
    );
    await userEvent.click(canvas.getByRole("tab", { name: "CWV Timings" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "TBT (ms)", pressed: true }),
    );
    await userEvent.click(canvas.getByRole("tab", { name: "Single Metric" }));
    await userEvent.click(canvas.getByRole("tab", { name: "LCP (ms)" }));
    await userEvent.click(canvas.getByRole("tab", { name: "CLS" }));
    await userEvent.click(canvas.getByRole("tab", { name: "Area" }));
    await userEvent.click(canvas.getByRole("tab", { name: "All 4 Scores" }));
    await expect(
      canvas.getByRole("button", { name: "Performance", pressed: true }),
    ).toBeInTheDocument();
  },
};

export const SwapBaselineControl: Story = {
  render: () => (
    <CompareProviders handler={populatedCompareHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Comparison Matrix (2 Runs)"),
    ).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Swap Baseline" }),
    );
  },
};

export const MatrixDiffAndCollapse: Story = {
  render: () => (
    <CompareProviders handler={populatedCompareHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Comparison Matrix (2 Runs)"),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: /Recent Runs/i }));
    await expect(
      await canvas.findByText("Comparison Matrix (3 Runs)"),
    ).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Diff Latest vs Baseline" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Collapse" }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Collapse" }));
  },
};

export const MatrixSortAndRemoveFocusedDiff: Story = {
  render: () => (
    <CompareProviders
      handler={populatedCompareHandler}
      initialSearch="?runs=cmp-run-1,cmp-run-2,cmp-run-3&baseline=cmp-run-1"
    >
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Comparison Matrix (3 Runs)"),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Perf" }));
    await userEvent.click(canvas.getByRole("button", { name: "Perf ↓" }));

    const diffInsightBtns = canvas.getAllByRole("button", {
      name: "Diff Insights",
    });
    const firstDiffBtn = diffInsightBtns[0];
    if (!firstDiffBtn) throw new Error("Expected Diff Insights button");
    await userEvent.click(firstDiffBtn);

    const setBaseBtns = canvas.getAllByRole("button", { name: "Set Base" });
    const rowSetBaseBtn = setBaseBtns.at(-1);
    if (!rowSetBaseBtn) throw new Error("Expected row Set Base button");
    await userEvent.click(rowSetBaseBtn);

    await userEvent.click(
      canvas.getByRole("button", { name: "Remove run cmp-run-2" }),
    );
    await expect(
      await canvas.findByText("Comparison Matrix (2 Runs)"),
    ).toBeInTheDocument();
  },
};

export const InspectorFromMatrix: Story = {
  render: () => (
    <CompareProviders handler={populatedCompareHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Comparison Matrix (2 Runs)"),
    ).toBeInTheDocument();

    const inspectBtns = canvas.getAllByRole("button", { name: "Inspect" });
    const firstInspect = inspectBtns[0];
    if (!firstInspect) throw new Error("Expected Inspect button");
    await userEvent.click(firstInspect);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByText("Audit Run Inspector"),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Close" }));
  },
};

export const PresetsAndMissingExplicitRun: Story = {
  render: () => (
    <CompareProviders
      handler={populatedCompareHandler}
      initialSearch="?runs=cmp-run-3,extra-missing-run"
    >
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Comparison Matrix (2 Runs)"),
    ).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: /Latest \/ URL/i }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: /^shop\.example\.com\/checkout/i }),
    );
    await expect(
      await canvas.findByText("Comparison Matrix (1 Run)"),
    ).toBeInTheDocument();
  },
};

export const ChartPointAndBarInspect: Story = {
  render: () => (
    <CompareProviders handler={populatedCompareHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText("Comparison Matrix (2 Runs)"),
    ).toBeInTheDocument();

    const chartSvg = await canvas.findByRole(
      "application",
      {},
      { timeout: 4000 },
    );
    await expect(chartSvg.innerHTML).not.toContain("var(--color-value)");
    await expect(chartSvg.innerHTML).toContain("var(--color-chart-1)");

    const rect = chartSvg.getBoundingClientRect();
    const clickX = rect.width > 0 ? rect.left + rect.width * 0.25 : 80;
    const clickY = rect.height > 0 ? rect.top + rect.height * 0.5 : 150;
    await fireEvent.mouseMove(chartSvg, { clientX: clickX, clientY: clickY });
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });
    await fireEvent.click(chartSvg, { clientX: clickX, clientY: clickY });

    await expect(
      await body.findByText("Audit Run Inspector"),
    ).toBeInTheDocument();
    await expect(body.getByText(/Inspecting run cmp-run-/)).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Close" }));
    await waitFor(async () => {
      await expect(
        body.queryByText("Audit Run Inspector"),
      ).not.toBeInTheDocument();
    });

    await userEvent.click(canvas.getByRole("tab", { name: "Bars" }));
    const barPath = await waitFor(() => {
      const target = canvasElement.querySelector(
        ".recharts-bar-rectangle path",
      );
      if (!target) {
        throw new Error("Expected rendered bar rectangle path");
      }
      return target;
    });
    const barSvg = barPath.closest("svg");
    if (!barSvg) {
      throw new Error("Expected bar chart SVG");
    }
    await expect(barSvg.innerHTML).not.toContain("var(--color-value)");
    await expect(barSvg.innerHTML).toContain("var(--color-chart-1)");

    await fireEvent.click(barPath);
    await expect(
      await body.findByText("Audit Run Inspector"),
    ).toBeInTheDocument();
  },
};

export const DeviceRuleSelectFiltering: Story = {
  render: () => (
    <CompareProviders handler={populatedCompareHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText("Comparison Matrix (2 Runs)"),
    ).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter comparison by device" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Mobile Only" }),
    );
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter comparison by device" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "All Devices" }),
    );
  },
};

export const AddRunSetBaseAndRemoveAll: Story = {
  render: () => (
    <CompareProviders handler={populatedCompareHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText("Comparison Matrix (2 Runs)"),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Add Run" }));
    const addPopoverRow = await body.findByText(/Nov 21.*desktop/i);
    await userEvent.click(addPopoverRow);

    const setBaseBtns = canvas.getAllByRole("button", { name: "Set Base" });
    if (setBaseBtns[0]) {
      await userEvent.click(setBaseBtns[0]);
    }
    const clickFirstRemove = async () => {
      const btn = canvas.queryAllByRole("button", {
        name: /Remove .* from comparison/i,
      })[0];
      if (btn) {
        await userEvent.click(btn);
      }
    };
    await clickFirstRemove();
    await clickFirstRemove();
    await clickFirstRemove();
    await expect(
      await canvas.findByText(/No runs selected\. Choose a preset or URL/i),
    ).toBeInTheDocument();
  },
};

export const ErrorRecoveryAndDiffRetry: Story = {
  render: () => {
    let listAttempts = 0;
    let diffAttempts = 0;
    const handler: FetchHandler = async (rawUrl: string) => {
      if (rawUrl.startsWith("/api/lighthouse/diff")) {
        diffAttempts += 1;
        if (diffAttempts === 1) {
          return new Response(
            JSON.stringify({
              error: { code: "INTERNAL", message: "Diff calculation timeout" },
            }),
            { status: 500 },
          );
        }
      } else if (!rawUrl.startsWith("/api/lighthouse/runs/")) {
        listAttempts += 1;
        if (listAttempts === 1) {
          return new Response(
            JSON.stringify({
              error: { code: "INTERNAL", message: "Runs store offline" },
            }),
            { status: 500 },
          );
        }
      }
      return populatedCompareHandler(rawUrl);
    };
    return (
      <CompareProviders handler={handler}>
        <ComparePage />
      </CompareProviders>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Unable to load Audit Runs"),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));

    await expect(
      await canvas.findByText("Unable to load Insight Audit Diff"),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(
      await canvas.findByText("Optimize LCP discovery"),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "New Audit" }));
    const body = within(document.body);
    await expect(
      await body.findByText("New Lighthouse Audit"),
    ).toBeInTheDocument();
  },
};

export const EmptyCompareState: Story = {
  render: () => (
    <CompareProviders handler={emptyCompareHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("No Audit Runs available to compare"),
    ).toBeInTheDocument();
  },
};

const MULTI_RUN_TREND_FIXTURE: readonly LighthouseRunListItem[] = [
  {
    id: "trend-run-6",
    url: "https://shop.example.com/",
    finalUrl: "https://shop.example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 95,
    accessibilityScore: 98,
    bestPracticesScore: 100,
    seoScore: 100,
    lcpMs: 1620,
    cls: 0.015,
    tbtMs: 70,
    fcpMs: 840,
    siMs: 1320,
    ttfbMs: 190,
    durationMs: 3600,
    createdAt: "2026-11-22T02:00:00.000Z",
    hasHtmlReport: true,
  },
  {
    id: "trend-run-5",
    url: "https://shop.example.com/",
    finalUrl: "https://shop.example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 91,
    accessibilityScore: 96,
    bestPracticesScore: 98,
    seoScore: 98,
    lcpMs: 1920,
    cls: 0.04,
    tbtMs: 105,
    fcpMs: 940,
    siMs: 1520,
    ttfbMs: 210,
    durationMs: 3900,
    createdAt: "2026-11-21T17:15:00.000Z",
    hasHtmlReport: true,
  },
  {
    id: "trend-run-4",
    url: "https://shop.example.com/",
    finalUrl: "https://shop.example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 84,
    accessibilityScore: 95,
    bestPracticesScore: 96,
    seoScore: 95,
    lcpMs: 2290,
    cls: 0.08,
    tbtMs: 150,
    fcpMs: 1050,
    siMs: 1750,
    ttfbMs: 240,
    durationMs: 4200,
    createdAt: "2026-11-20T19:40:00.000Z",
    hasHtmlReport: true,
  },
  {
    id: "trend-run-3",
    url: "https://shop.example.com/",
    finalUrl: "https://shop.example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 76,
    accessibilityScore: 95,
    bestPracticesScore: 96,
    seoScore: 92,
    lcpMs: 2640,
    cls: 0.11,
    tbtMs: 195,
    fcpMs: 1180,
    siMs: 1980,
    ttfbMs: 280,
    durationMs: 4600,
    createdAt: "2026-11-19T16:25:00.000Z",
    hasHtmlReport: true,
  },
  {
    id: "trend-run-2",
    url: "https://shop.example.com/",
    finalUrl: "https://shop.example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 62,
    accessibilityScore: 92,
    bestPracticesScore: 90,
    seoScore: 90,
    lcpMs: 3120,
    cls: 0.142,
    tbtMs: 280,
    fcpMs: null,
    siMs: 2450,
    ttfbMs: 340,
    durationMs: 5000,
    createdAt: "2026-11-18T10:15:00.000Z",
    hasHtmlReport: true,
  },
  {
    id: "trend-run-1",
    url: "https://shop.example.com/",
    finalUrl: "https://shop.example.com/",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 46,
    accessibilityScore: 88,
    bestPracticesScore: 85,
    seoScore: 90,
    lcpMs: 3820,
    cls: 0.19,
    tbtMs: 420,
    fcpMs: 1850,
    siMs: 3100,
    ttfbMs: 420,
    durationMs: 5400,
    createdAt: "2026-11-16T15:00:00.000Z",
    hasHtmlReport: true,
  },
];

const multiRunTrendHandler = createCompareFetchHandler(MULTI_RUN_TREND_FIXTURE);

export const MultiRunTrendOverlay: Story = {
  render: () => (
    <CompareProviders handler={multiRunTrendHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Trend Across Selected Runs (6)"),
    ).toBeInTheDocument();

    const chartSvg = await canvas.findByRole(
      "application",
      {},
      { timeout: 4000 },
    );
    const rect = chartSvg.getBoundingClientRect();
    const hoverX = rect.width > 0 ? rect.left + rect.width * 0.5 : 180;
    const hoverY = rect.height > 0 ? rect.top + rect.height * 0.5 : 140;
    await fireEvent.mouseMove(chartSvg, { clientX: hoverX, clientY: hoverY });
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    await userEvent.click(canvas.getByRole("tab", { name: "CWV Timings" }));
    await fireEvent.mouseMove(chartSvg, { clientX: hoverX, clientY: hoverY });
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    await userEvent.click(canvas.getByRole("tab", { name: "Single Metric" }));
    await fireEvent.mouseMove(chartSvg, { clientX: hoverX, clientY: hoverY });
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    await userEvent.click(canvas.getByRole("tab", { name: "LCP (ms)" }));
    await fireEvent.mouseMove(chartSvg, { clientX: hoverX, clientY: hoverY });
    await waitFor(async () => {
      const footer = canvas.getByText("Click to inspect");
      const tooltip = footer.parentElement?.parentElement;
      if (!tooltip) throw new Error("Expected tooltip container");
      await expect(within(tooltip).getByText("LCP (ms)")).toBeInTheDocument();
      await expect(within(tooltip).getByText(/[+-]\d+ ms/)).toBeInTheDocument();
    });

    await userEvent.click(canvas.getByRole("tab", { name: "CLS" }));
    await fireEvent.mouseMove(chartSvg, { clientX: hoverX, clientY: hoverY });
    await waitFor(async () => {
      const footer = canvas.getByText("Click to inspect");
      const tooltip = footer.parentElement?.parentElement;
      if (!tooltip) throw new Error("Expected tooltip container");
      await expect(within(tooltip).getByText("CLS")).toBeInTheDocument();
      await expect(
        within(tooltip).getByText(/[+-]0\.\d{3}/),
      ).toBeInTheDocument();
    });

    await userEvent.click(canvas.getByRole("tab", { name: "All 4 Scores" }));
    await expect(
      canvas.getByRole("button", { name: "Performance", pressed: true }),
    ).toBeInTheDocument();
  },
};

function createCustomDiffHandler(
  overrideDiff: (base: LighthouseDiffResponse) => LighthouseDiffResponse,
): FetchHandler {
  const baseHandler = createCompareFetchHandler(COMPARE_RUNS);
  return async (rawUrl: string) => {
    if (rawUrl.startsWith("/api/lighthouse/diff")) {
      const parsed = new URL(rawUrl, "http://localhost");
      const baseline = parsed.searchParams.get("baseline") ?? "";
      const comparison = parsed.searchParams.get("comparison") ?? "";
      const payload = overrideDiff(createDiffPayload(baseline, comparison));
      return new Response(JSON.stringify(payload), { status: 200 });
    }
    return baseHandler(rawUrl);
  };
}

const mixedDiffHandler = createCustomDiffHandler((payload) => ({
  ...payload,
  baseline: {
    ...payload.baseline,
    summary: {
      ...payload.baseline.summary,
      insights: [
        {
          id: "lcp-discovery-insight",
          title: "Optimize LCP discovery",
          description:
            "Preload [LCP image](https://example.com) with `fetchpriority`.",
          score: 0,
          scoreDisplayMode: "numeric",
          displayValue: "250 ms",
          metricSavings: { LCP: 250 },
          replacesAudits: [],
        },
      ],
    },
  },
  comparison: {
    ...payload.comparison,
    summary: {
      ...payload.comparison.summary,
      insights: [
        {
          id: "cls-culprits-insight",
          title: "Layout shift culprits",
          description: "Reserve explicit `aspect-ratio` dimensions.",
          score: 0,
          scoreDisplayMode: "numeric",
          displayValue: "0.08",
          metricSavings: {},
          replacesAudits: [],
        },
      ],
    },
  },
  deltas: {
    ...payload.deltas,
    scores: {
      ...payload.deltas.scores,
      performanceScore: 5,
    },
    insights: {
      resolved: [
        { id: "lcp-discovery-insight", title: "Optimize LCP discovery" },
      ],
      regressed: [
        { id: "cls-culprits-insight", title: "Layout shift culprits" },
      ],
      clsCulpritDelta: 1,
    },
  },
}));

export const MixedDiffVerdictWithInsightDetails: Story = {
  render: () => (
    <CompareProviders handler={mixedDiffHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Mixed changes: 1 resolved, 1 regressed"),
    ).toBeInTheDocument();
    await expect(await canvas.findByText("LCP 250 ms")).toBeInTheDocument();
    await expect(
      await canvas.findByText("Preload LCP image with fetchpriority."),
    ).toBeInTheDocument();
  },
};

const neutralDiffHandler = createCustomDiffHandler((payload) => ({
  ...payload,
  deltas: {
    ...payload.deltas,
    scores: {
      ...payload.deltas.scores,
      performanceScore: 0,
    },
    insights: {
      resolved: [],
      regressed: [],
      clsCulpritDelta: 0,
    },
  },
}));

export const NeutralDiffVerdict: Story = {
  render: () => (
    <CompareProviders handler={neutralDiffHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("No major score or insight transitions"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "Performance score and insight statuses match the baseline run.",
      ),
    ).toBeInTheDocument();
  },
};

const partialMissingAndTruncatedHandler: FetchHandler = async (
  rawUrl: string,
) => {
  if (rawUrl === "/api/lighthouse/runs/missing-404") {
    return new Response(
      JSON.stringify({
        error: { code: "NOT_FOUND", message: "Run not found" },
      }),
      { status: 404 },
    );
  }
  if (rawUrl.startsWith("/api/lighthouse/runs?")) {
    return new Response(
      JSON.stringify({
        runs: COMPARE_RUNS,
        total: 120,
        limit: 100,
        offset: 0,
      }),
      { status: 200 },
    );
  }
  return populatedCompareHandler(rawUrl);
};

export const PartialMissingRunAndTruncatedHistoryNotice: Story = {
  render: () => (
    <CompareProviders
      handler={partialMissingAndTruncatedHandler}
      initialSearch="?runs=cmp-run-1,cmp-run-3,missing-404&baseline=cmp-run-1"
    >
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Some selected runs could not be loaded"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/Showing the latest 3 of 120 runs/i),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Comparison Matrix (2 Runs)"),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));
    await waitFor(async () => {
      await expect(
        canvas.queryByText("Some selected runs could not be loaded"),
      ).not.toBeInTheDocument();
    });
  },
};

const symmetricMixedHandler = createCustomDiffHandler((payload) => ({
  ...payload,
  deltas: {
    ...payload.deltas,
    scores: {
      ...payload.deltas.scores,
      performanceScore: -4,
    },
    insights: {
      resolved: [
        { id: "lcp-discovery-insight", title: "Optimize LCP discovery" },
      ],
      regressed: [],
      clsCulpritDelta: 0,
    },
  },
}));

export const SymmetricMixedVerdictScoreDropWithResolvedInsight: Story = {
  render: () => (
    <CompareProviders handler={symmetricMixedHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(
        "Mixed changes: 1 insight resolved, Performance -4 pts",
      ),
    ).toBeInTheDocument();
  },
};

const regressionDiffHandler = createCustomDiffHandler((payload) => ({
  ...payload,
  deltas: {
    ...payload.deltas,
    scores: {
      ...payload.deltas.scores,
      performanceScore: -8,
    },
    insights: {
      resolved: [],
      regressed: [
        { id: "cls-culprits-insight", title: "Layout shift culprits" },
      ],
      clsCulpritDelta: 1,
    },
  },
}));

export const RegressionDiffVerdict: Story = {
  render: () => (
    <CompareProviders handler={regressionDiffHandler}>
      <ComparePage />
    </CompareProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Regression detected (Performance -8 pts)"),
    ).toBeInTheDocument();
  },
};
