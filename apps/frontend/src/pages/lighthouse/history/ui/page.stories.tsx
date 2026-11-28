import type * as React from "react";
import { useEffect, useState } from "react";
import type {
  LighthouseRunDetail,
  LighthouseRunListItem,
} from "@devtools/lighthouse/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { HistoryPage } from "./page";

type FetchHandler = (url: string) => Promise<Response>;

function HistoryProviders({
  handler,
  children,
}: {
  handler: FetchHandler;
  children: React.ReactNode;
}) {
  const [state] = useState(() => {
    const previousFetch = globalThis.fetch;
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
    return { client, previousFetch, stubFetch };
  });

  useEffect(() => {
    return () => {
      if (globalThis.fetch === state.stubFetch) {
        globalThis.fetch = state.previousFetch;
      }
      state.client.clear();
    };
  }, [state]);

  return (
    <QueryClientProvider client={state.client}>{children}</QueryClientProvider>
  );
}

const SAMPLE_RUNS: readonly LighthouseRunListItem[] = [
  {
    id: "run-hist-001",
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
    tbtMs: 95,
    fcpMs: 900,
    siMs: 1450,
    ttfbMs: 220,
    durationMs: 4200,
    createdAt: "2026-11-22T02:00:00.000Z",
    hasHtmlReport: true,
  },
  {
    id: "run-hist-002",
    url: "https://shop.example.com/checkout",
    finalUrl: "https://shop.example.com/checkout",
    formFactor: "desktop",
    throttlingMethod: "devtools",
    performanceScore: 71,
    accessibilityScore: 92,
    bestPracticesScore: 90,
    seoScore: 95,
    lcpMs: 3150,
    cls: 0.14,
    tbtMs: 280,
    fcpMs: 1450,
    siMs: 2800,
    ttfbMs: 390,
    durationMs: 5600,
    createdAt: "2026-11-21T16:00:00.000Z",
    hasHtmlReport: true,
  },
];

function toDetail(item: LighthouseRunListItem): LighthouseRunDetail {
  return {
    ...item,
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

function createListFetchHandler(
  runsSource: readonly LighthouseRunListItem[],
): FetchHandler {
  return async (rawUrl: string) => {
    if (rawUrl === "/api/lighthouse/audits/active") {
      return new Response(JSON.stringify({ active: false, job: null }), {
        status: 200,
      });
    }
    if (rawUrl.startsWith("/api/lighthouse/runs/")) {
      const id = decodeURIComponent(
        rawUrl.slice("/api/lighthouse/runs/".length),
      );
      const found = runsSource.find((r) => r.id === id);
      if (!found) {
        return new Response(
          JSON.stringify({
            error: { code: "NOT_FOUND", message: "Run not found" },
          }),
          { status: 404 },
        );
      }
      return new Response(JSON.stringify(toDetail(found)), { status: 200 });
    }
    const parsed = new URL(rawUrl, "http://localhost");
    const search = parsed.searchParams.get("search")?.toLowerCase() ?? "";
    const urlParam = parsed.searchParams.get("url");
    const formFactor = parsed.searchParams.get("formFactor");
    const throttlingMethod = parsed.searchParams.get("throttlingMethod");
    const limit = Number(parsed.searchParams.get("limit") ?? "50");
    const offset = Number(parsed.searchParams.get("offset") ?? "0");

    const filtered = runsSource.filter((run) => {
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
  };
}

const populatedHandler = createListFetchHandler(SAMPLE_RUNS);
const emptyHandler = createListFetchHandler([]);

const meta: Meta<typeof HistoryPage> = {
  title: "Pages/Lighthouse/HistoryPage",
  component: HistoryPage,
  tags: ["autodocs"],
  parameters: {
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof HistoryPage>;

export const PopulatedSelectionAndClear: Story = {
  render: () => (
    <HistoryProviders handler={populatedHandler}>
      <HistoryPage />
    </HistoryProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Latest Audit")).toBeInTheDocument();
    await expect(canvas.getByText("Audit History (2)")).toBeInTheDocument();

    const selectAllCheckbox = canvas.getByRole("checkbox", {
      name: "Select all visible runs",
    });
    await userEvent.click(selectAllCheckbox);
    await userEvent.click(selectAllCheckbox);
    await userEvent.click(selectAllCheckbox);
    const compareLink = await canvas.findByRole("link", {
      name: /Compare Selected \(2 Runs\)/i,
    });
    await expect(compareLink).toHaveAttribute(
      "href",
      "/lighthouse/compare?runs=run-hist-001%2Crun-hist-002&baseline=run-hist-002",
    );

    await userEvent.click(canvas.getByRole("button", { name: "Clear" }));
    await expect(
      canvas.queryByRole("link", { name: /Compare Selected/i }),
    ).not.toBeInTheDocument();
  },
};

export const InspectorAndSearchReset: Story = {
  render: () => (
    <HistoryProviders handler={populatedHandler}>
      <HistoryPage />
    </HistoryProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Audit History (2)"),
    ).toBeInTheDocument();

    const inspectButtons = canvas.getAllByRole("button", { name: "Inspect" });
    const latestInspect = inspectButtons[0];
    const rowInspect = inspectButtons[1];
    if (!latestInspect || !rowInspect) {
      throw new Error("Expected Inspect buttons");
    }
    await userEvent.click(latestInspect);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByText("Audit Run Inspector"),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Close" }));

    await userEvent.click(rowInspect);
    await expect(
      await body.findByText("Audit Run Inspector"),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Close" }));

    const searchInput = canvas.getByRole("searchbox", {
      name: "Search Audit Runs",
    });
    await userEvent.type(searchInput, "out");
    await expect(
      await canvas.findByText("Audit History (1)"),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
    await expect(
      await canvas.findByText("Audit History (2)"),
    ).toBeInTheDocument();
  },
};

export const EmptyFirstRun: Story = {
  render: () => (
    <HistoryProviders handler={emptyHandler}>
      <HistoryPage />
    </HistoryProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("No Audit Runs recorded yet"),
    ).toBeInTheDocument();
  },
};

export const HistoryErrorRetry: Story = {
  render: () => {
    let historyAttempts = 0;
    const baseHandler = populatedHandler;
    const handler: FetchHandler = async (url) => {
      if (url.includes("limit=20")) {
        historyAttempts += 1;
        if (historyAttempts === 1) {
          return new Response(
            JSON.stringify({
              error: { code: "INTERNAL", message: "Temporary database error" },
            }),
            { status: 500 },
          );
        }
      }
      return baseHandler(url);
    };
    return (
      <HistoryProviders handler={handler}>
        <HistoryPage />
      </HistoryProviders>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Unable to load Audit History"),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(
      await canvas.findByText("Audit History (2)"),
    ).toBeInTheDocument();
  },
};

export const PaginationNextAndPrev: Story = {
  render: () => {
    const templateRun = SAMPLE_RUNS[0];
    if (!templateRun) {
      throw new Error("Expected template fixture run");
    }
    const largeRuns: LighthouseRunListItem[] = Array.from(
      { length: 22 },
      (_, idx) => ({
        ...templateRun,
        id: `run-page-${idx + 1}`,
        createdAt: new Date(Date.UTC(2026, 10, 22 - idx, 10, 0)).toISOString(),
      }),
    );
    const handler = createListFetchHandler(largeRuns);
    return (
      <HistoryProviders handler={handler}>
        <HistoryPage />
      </HistoryProviders>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Showing 1–20 of 22 runs"),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(
      await canvas.findByText("Showing 21–22 of 22 runs"),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Previous" }));
    await expect(
      await canvas.findByText("Showing 1–20 of 22 runs"),
    ).toBeInTheDocument();
  },
};

export const FiltersEmptyRecovery: Story = {
  render: () => (
    <HistoryProviders handler={populatedHandler}>
      <HistoryPage />
    </HistoryProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Audit History (2)"),
    ).toBeInTheDocument();

    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter by URL" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "shop.example.com/" }),
    );
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter by device" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "Desktop" }));

    await expect(
      await canvas.findByText("No Audit Runs match the current filters"),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Reset Filters" }),
    );
    await expect(
      await canvas.findByText("Audit History (2)"),
    ).toBeInTheDocument();
  },
};

export const DeviceFilterAndRowToggle: Story = {
  render: () => (
    <HistoryProviders handler={populatedHandler}>
      <HistoryPage />
    </HistoryProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Audit History (2)"),
    ).toBeInTheDocument();

    const body = within(canvasElement.ownerDocument.body);
    const rowCheckboxes = canvas.getAllByRole("checkbox", {
      name: "Select run run-hist",
    });
    const firstRowCheckbox = rowCheckboxes[0];
    if (!firstRowCheckbox) throw new Error("Expected row checkbox");
    await userEvent.click(firstRowCheckbox);
    await userEvent.click(firstRowCheckbox);

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter by device" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "Desktop" }));
    await expect(
      await canvas.findByText("Audit History (1)"),
    ).toBeInTheDocument();
    const tableAfterDevice = canvas.getByRole("table");
    await expect(
      within(tableAfterDevice).queryByText("https://shop.example.com/"),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter by device" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "All Devices" }),
    );
    await expect(
      await canvas.findByText("Audit History (2)"),
    ).toBeInTheDocument();
  },
};

export const ThrottlingFilterResetToAll: Story = {
  render: () => (
    <HistoryProviders handler={populatedHandler}>
      <HistoryPage />
    </HistoryProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Audit History (2)"),
    ).toBeInTheDocument();

    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter by throttling" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "DevTools (CDP)" }),
    );
    await expect(
      await canvas.findByText("Audit History (1)"),
    ).toBeInTheDocument();
    const tableAfterThrottling = canvas.getByRole("table");
    await expect(
      within(tableAfterThrottling).queryByText("https://shop.example.com/"),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter by throttling" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "All Throttling" }),
    );
    await expect(
      await canvas.findByText("Audit History (2)"),
    ).toBeInTheDocument();
  },
};

export const NewAuditAndRerunSheets: Story = {
  render: () => (
    <HistoryProviders handler={populatedHandler}>
      <HistoryPage />
    </HistoryProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Audit History (2)"),
    ).toBeInTheDocument();

    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "New Audit" }));
    await expect(
      await body.findByText("New Lighthouse Audit"),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Cancel" }));

    const rerunBtns = canvas.getAllByRole("button", { name: "Re-run" });
    const latestRerun = rerunBtns[0];
    const rowRerun = rerunBtns[1];
    if (!latestRerun || !rowRerun) {
      throw new Error("Expected Re-run buttons");
    }
    await userEvent.click(latestRerun);
    await expect(
      await body.findByText("New Lighthouse Audit"),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Cancel" }));

    await userEvent.click(rowRerun);
    await expect(
      await body.findByText("New Lighthouse Audit"),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Cancel" }));
  },
};
