import type { LighthouseRunDetail } from "@devtools/lighthouse/schemas";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";
import { RunDetailBody } from "./run-detail-tabs";

const SAMPLE_RUN: LighthouseRunDetail = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  url: "https://shop.example.com/",
  finalUrl: "https://shop.example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  performanceScore: 92,
  accessibilityScore: 96,
  bestPracticesScore: 95,
  seoScore: 100,
  lcpMs: 1850,
  cls: 0.03,
  tbtMs: 85,
  fcpMs: 950,
  siMs: 1400,
  ttfbMs: 220,
  durationMs: 3400,
  hasHtmlReport: true,
  createdAt: "2026-11-22T02:00:00.000Z",
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

const RICH_RUN: LighthouseRunDetail = {
  ...SAMPLE_RUN,
  finalUrl: "https://shop.example.com/home",
  lcpMs: 5100,
  cls: 0.32,
  tbtMs: null,
  summary: {
    runtimeError: {
      code: "NO_FCP",
      message: "Lighthouse recorded a partial trace.",
    },
    runWarnings: ["Page redirected before FCP."],
    lcpPhases: {
      timeToFirstByteMs: 220,
      resourceLoadDelayMs: 180,
      resourceLoadDurationMs: 640,
      elementRenderDelayMs: null,
    },
    lcpElement: {
      selector: "img.hero",
      nodeLabel: "Hero",
      snippet: '<img class="hero" src="/hero.webp" />',
      path: "1,HTML,1,BODY,0,IMG",
      lhId: "lcp-1",
      boundingRect: {
        width: 1200,
        height: 600,
        left: 0,
        top: 64,
        right: 1200,
        bottom: 664,
      },
    },
    insights: [
      {
        id: "lcp-discovery",
        title: "LCP request discovery",
        description: "Optimize LCP image loading.",
        score: 0.4,
        scoreDisplayMode: "numeric",
        displayValue: "450 ms",
        metricSavings: { LCP: 450, CLS: 0.045 },
        replacesAudits: ["prioritize-lcp-image"],
      },
    ],
    clsCulprits: [
      {
        element: {
          selector: "div.banner",
          nodeLabel: "Banner",
          snippet: '<div class="banner">Promo</div>',
          path: null,
          lhId: null,
          boundingRect: null,
        },
        score: 0.12,
        causes: [
          {
            cause: "Unsized image",
            url: "https://shop.example.com/banner.png",
            selector: null,
          },
        ],
      },
    ],
    failedAudits: [
      {
        id: "unused-js",
        title: "Reduce unused JavaScript",
        description: "Remove dead bundles.",
        score: 0.3,
        scoreDisplayMode: "numeric",
        displayValue: "140 KiB",
        category: "performance",
      },
    ],
    medianMetadata: {
      totalRuns: 3,
      selectedRunIndex: 1,
      medianFcpMs: 1000,
      medianInteractiveMs: 2500,
      runDistances: [
        {
          runIndex: 0,
          fcpMs: 920,
          interactiveMs: 2400,
          distanceSquared: 16400,
        },
        { runIndex: 1, fcpMs: 1000, interactiveMs: 2500, distanceSquared: 0 },
        {
          runIndex: 2,
          fcpMs: 1120,
          interactiveMs: 2700,
          distanceSquared: 54400,
        },
      ],
    },
  },
};

const meta: Meta<typeof RunDetailBody> = {
  title: "Entities/LighthouseRun/RunDetailBody",
  component: RunDetailBody,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof RunDetailBody>;

const POPULATED_SUMMARY_RUN: LighthouseRunDetail = {
  id: "run-ex02b7c3-d5e6-4f7a-8b22-example00002",
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  formFactor: "desktop",
  throttlingMethod: "provided",
  performanceScore: 100,
  accessibilityScore: 96,
  bestPracticesScore: 100,
  seoScore: 80,
  lcpMs: 490,
  cls: 0,
  tbtMs: 12,
  fcpMs: 360,
  siMs: 680,
  ttfbMs: 180,
  durationMs: 7400,
  hasHtmlReport: true,
  createdAt: "2026-11-20T14:20:00.000Z",
  summary: {
    runtimeError: null,
    runWarnings: [],
    medianMetadata: null,
    lcpPhases: {
      timeToFirstByteMs: 180,
      resourceLoadDelayMs: null,
      resourceLoadDurationMs: null,
      elementRenderDelayMs: 310,
    },
    lcpElement: {
      selector: "body > p",
      nodeLabel: "Example paragraph",
      snippet: "<p>This domain is for use in illustrative examples...</p>",
      path: "1,HTML,1,BODY,6,P",
      lhId: "page-0-P",
      boundingRect: {
        width: 600,
        height: 70,
        left: 180,
        top: 220,
        right: 780,
        bottom: 290,
      },
    },
    insights: [
      {
        id: "cache-insight",
        title: "Use efficient cache lifetimes",
        description: "Short cache TTL on static response.",
        score: 0.5,
        scoreDisplayMode: "numeric",
        displayValue: "1 KiB",
        metricSavings: {},
        replacesAudits: [],
      },
    ],
    clsCulprits: [],
    failedAudits: [
      {
        id: "meta-description",
        title: "Document does not have a meta description",
        description: "Meta descriptions help summarize page content.",
        score: 0,
        scoreDisplayMode: "binary",
        displayValue: null,
        category: "seo",
      },
    ],
  },
};

export const SummaryView: Story = {
  args: {
    isPending: false,
    errorMessage: null,
    run: POPULATED_SUMMARY_RUN,
    tab: "summary",
    variant: "page",
    onTabChange: fn(),
    onRetry: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Category Scores")).toBeInTheDocument();
    await expect(
      canvas.getByText("Use efficient cache lifetimes"),
    ).toBeInTheDocument();
  },
};

export const EmptyDiagnostics: Story = {
  args: {
    isPending: false,
    errorMessage: null,
    run: SAMPLE_RUN,
    tab: "summary",
    variant: "page",
    onTabChange: fn(),
    onRetry: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("No LCP phase timing breakdown recorded."),
    ).toBeInTheDocument();
  },
};

export const RichSummaryDiagnosticsAndBatch: Story = {
  args: {
    isPending: false,
    errorMessage: null,
    run: RICH_RUN,
    tab: "summary",
    variant: "page",
    onTabChange: fn(),
    onRetry: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/Runtime Error \(NO_FCP\)/i),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Representative Run")).toBeInTheDocument();
    await expect(canvas.getByText("N/A (text element)")).toBeInTheDocument();
  },
};

export const ReportTabWithHtml: Story = {
  args: {
    isPending: false,
    errorMessage: null,
    run: SAMPLE_RUN,
    tab: "report",
    variant: "page",
    onTabChange: fn(),
    onRetry: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Lighthouse v13 Standalone Report"),
    ).toBeInTheDocument();
  },
};

export const ReportTabMissingHtml: Story = {
  args: {
    isPending: false,
    errorMessage: null,
    run: { ...SAMPLE_RUN, hasHtmlReport: false },
    tab: "report",
    variant: "compact",
    onTabChange: fn(),
    onRetry: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("HTML Report Artifact unavailable"),
    ).toBeInTheDocument();
  },
};

export const LoadingSkeleton: Story = {
  args: {
    isPending: true,
    errorMessage: null,
    run: undefined,
    tab: "summary",
    variant: "compact",
    onTabChange: fn(),
    onRetry: fn(),
  },
};

export const ErrorWithRetry: Story = {
  args: {
    isPending: false,
    errorMessage: "Failed to load Audit Run",
    run: undefined,
    tab: "summary",
    variant: "page",
    onTabChange: fn(),
    onRetry: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};
