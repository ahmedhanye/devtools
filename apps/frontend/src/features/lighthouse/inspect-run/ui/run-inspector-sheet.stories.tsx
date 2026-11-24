import type * as React from "react";
import { useEffect, useState } from "react";
import type { LighthouseRunDetail } from "@devtools/lighthouse/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";
import { RunInspectorSheet } from "./run-inspector-sheet";

type FetchHandler = (url: string) => Promise<Response>;

function InspectorProviders({
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

const SAMPLE_RUN_DETAIL: LighthouseRunDetail = {
  id: "run-inspect-1234",
  url: "https://shop.example.com/",
  finalUrl: "https://shop.example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  performanceScore: 91,
  accessibilityScore: 96,
  bestPracticesScore: 94,
  seoScore: 98,
  lcpMs: 1950,
  cls: 0.04,
  tbtMs: 105,
  fcpMs: 990,
  siMs: 1600,
  ttfbMs: 210,
  durationMs: 4100,
  createdAt: "2026-11-22T01:45:00.000Z",
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

const meta: Meta<typeof RunInspectorSheet> = {
  title: "Features/Lighthouse/RunInspectorSheet",
  component: RunInspectorSheet,
  tags: ["autodocs"],
  parameters: {
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof RunInspectorSheet>;

const summaryHandler: FetchHandler = async (url) => {
  if (url === "/api/lighthouse/runs/run-inspect-1234") {
    return new Response(JSON.stringify(SAMPLE_RUN_DETAIL), { status: 200 });
  }
  return new Response(null, { status: 404 });
};

export const SummaryAndMissingReportTab: Story = {
  args: {
    runId: "run-inspect-1234",
    onOpenChange: fn(),
  },
  render: (args) => (
    <InspectorProviders handler={summaryHandler}>
      <RunInspectorSheet runId={args.runId} onOpenChange={args.onOpenChange} />
    </InspectorProviders>
  ),
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const fullPageLink = await body.findByRole("link", {
      name: "Open Full Page",
    });
    await expect(fullPageLink).toHaveAttribute(
      "href",
      "/lighthouse/run?id=run-inspect-1234",
    );
    await expect(
      body.getByRole("link", { name: "New Window" }),
    ).toHaveAttribute("href", "/lighthouse/run?id=run-inspect-1234");

    const reportTab = body.getByRole("tab", { name: "HTML Report" });
    await userEvent.click(reportTab);
    await expect(
      await body.findByText("HTML Report Artifact unavailable"),
    ).toBeInTheDocument();
    await expect(fullPageLink).toHaveAttribute(
      "href",
      "/lighthouse/run?id=run-inspect-1234&tab=report",
    );

    await userEvent.click(fullPageLink);
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const ErrorAndRetryRecovery: Story = {
  args: {
    runId: "run-inspect-1234",
    onOpenChange: fn(),
  },
  render: (args) => {
    let attempts = 0;
    const handler: FetchHandler = async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response(
          JSON.stringify({
            error: { code: "NOT_FOUND", message: "Run missing temporarily" },
          }),
          { status: 404 },
        );
      }
      return new Response(JSON.stringify(SAMPLE_RUN_DETAIL), { status: 200 });
    };
    return (
      <InspectorProviders handler={handler}>
        <RunInspectorSheet
          runId={args.runId}
          onOpenChange={args.onOpenChange}
        />
      </InspectorProviders>
    );
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByText("Unable to load Audit Run"),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Retry" }));
    await expect(await body.findByText("Category Scores")).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Close" }));
    await expect(args.onOpenChange).toHaveBeenCalledTimes(1);
    await expect(args.onOpenChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ reason: "close-press" }),
    );
  },
};
