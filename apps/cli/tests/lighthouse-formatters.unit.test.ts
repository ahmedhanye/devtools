import { describe, expect, test } from "bun:test";
import type { LighthouseRunRow } from "@devtools/db";
import type { NormalizedLighthouseRun } from "@devtools/lighthouse";
import { formatAgentMarkdown } from "../src/lighthouse/formatters/agent";
import { formatJson } from "../src/lighthouse/formatters/json";
import {
  formatTerminalDiff,
  formatTerminalList,
  formatTerminalSummary,
} from "../src/lighthouse/formatters/terminal";

const sampleNormalizedRun: NormalizedLighthouseRun = {
  requestedUrl: "https://example.com/",
  finalUrl: "https://example.com/",
  scores: {
    performanceScore: 78,
    accessibilityScore: 92,
    bestPracticesScore: 85,
    seoScore: 100,
  },
  metrics: {
    lcpMs: 3820,
    cls: 0.185,
    tbtMs: 340,
    fcpMs: 1420,
    siMs: 2500,
    ttfbMs: 210,
  },
  summary: {
    lcpElement: {
      selector: "main > section.hero > img.banner-img",
      snippet: '<img src="/hero.jpg" class="banner-img">',
      nodeLabel: "img.banner-img",
      path: "1,HTML,1,BODY,0,MAIN,0,SECTION,0,IMG",
      lhId: "page-0-IMG",
      boundingRect: {
        top: 100,
        bottom: 500,
        left: 50,
        right: 850,
        width: 800,
        height: 400,
      },
    },
    lcpPhases: {
      timeToFirstByteMs: 210,
      resourceLoadDelayMs: 1840,
      resourceLoadDurationMs: 1420,
      elementRenderDelayMs: 350,
    },
    clsCulprits: [
      {
        element: {
          selector: "header > div.announcement-bar",
          snippet: '<div class="announcement-bar">Free shipping</div>',
          nodeLabel: "div.announcement-bar",
          path: null,
          lhId: null,
          boundingRect: {
            top: 0,
            bottom: 40,
            left: 0,
            right: 1200,
            width: 1200,
            height: 40,
          },
        },
        score: 0.142,
        causes: [
          {
            cause: "Injected after initial paint without reserved space",
            url: null,
            selector: null,
          },
        ],
      },
    ],
    insights: [
      {
        id: "unused-javascript",
        title: "Reduce unused JavaScript",
        description:
          "Reduce unused JavaScript and defer loading scripts until they are required to decrease bytes consumed by network activity.",
        score: 0.45,
        scoreDisplayMode: "numeric",
        displayValue: "Est savings: 620 ms",
        metricSavings: {
          LCP: 620,
        },
        replacesAudits: ["unused-javascript"],
      },
    ],
    failedAudits: [
      {
        id: "button-name",
        title: "Buttons do not have an accessible name",
        description:
          "When a button doesn't have an accessible name, screen readers announce it as 'button'.",
        category: "accessibility",
        score: 0,
        scoreDisplayMode: "binary",
        displayValue: null,
      },
    ],
    runWarnings: [],
    runtimeError: null,
    medianMetadata: null,
  },
};

const sampleRow1: LighthouseRunRow = {
  id: "3f74b419-f027-4c07-b359-5f2105e46342",
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  performanceScore: 70,
  accessibilityScore: 88,
  bestPracticesScore: 80,
  seoScore: 90,
  lcpMs: 4200,
  cls: 0.22,
  tbtMs: 400,
  fcpMs: 1600,
  siMs: 3000,
  ttfbMs: 300,
  summaryJson: {
    lcpElement: null,
    lcpPhases: null,
    clsCulprits: [],
    insights: [],
    failedAudits: [],
    runWarnings: [],
    runtimeError: null,
    medianMetadata: null,
  },
  jsonReportPath: "/tmp/r1/report.json",
  htmlReportPath: "/tmp/r1/report.html",
  durationMs: 4000,
  createdAt: new Date("2026-11-04T12:00:00Z"),
};

const sampleRow2: LighthouseRunRow = {
  id: "8c91a723-d142-4f18-a621-7e3240b98561",
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  performanceScore: 85,
  accessibilityScore: 94,
  bestPracticesScore: 85,
  seoScore: 95,
  lcpMs: 2400,
  cls: 0.08,
  tbtMs: 180,
  fcpMs: 1100,
  siMs: 2100,
  ttfbMs: 150,
  summaryJson: sampleNormalizedRun.summary,
  jsonReportPath: "/tmp/r2/report.json",
  htmlReportPath: "/tmp/r2/report.html",
  durationMs: 3800,
  createdAt: new Date("2026-11-04T14:00:00Z"),
};

describe("Lighthouse Formatters (Unit)", () => {
  describe("formatAgentMarkdown", () => {
    test("produces clean, un-truncated markdown with zero ANSI escape codes", () => {
      const output = formatAgentMarkdown(sampleNormalizedRun, "mobile");
      // Check for zero ANSI
      // oxlint-disable-next-line no-control-regex
      expect(/\u001b\[/.test(output)).toBe(false);
      // Contains header and category scores
      expect(output).toContain(
        "# Lighthouse Audit: https://example.com/ (mobile)",
      );
      expect(output).toContain("Performance: 78");
      expect(output).toContain("Accessibility: 92");
    });

    test("includes Core Web Vitals table with status and targets", () => {
      const output = formatAgentMarkdown(sampleNormalizedRun, "mobile");
      expect(output).toContain("## Core Web Vitals");
      expect(output).toContain(
        "| LCP | 3,820 ms | <= 2,500 ms | NEEDS IMPROVEMENT |",
      );
      expect(output).toContain(
        "| CLS | 0.185 | <= 0.100 | NEEDS IMPROVEMENT |",
      );
      expect(output).toContain(
        "| TBT | 340 ms | <= 200 ms | NEEDS IMPROVEMENT |",
      );
    });

    test("includes exact DOM selector, HTML snippet, and LCP 4 phases", () => {
      const output = formatAgentMarkdown(sampleNormalizedRun, "mobile");
      expect(output).toContain("main > section.hero > img.banner-img");
      expect(output).toContain('<img src="/hero.jpg" class="banner-img">');
      expect(output).toContain(
        "Phases: TTFB: 210 ms | Load Delay: 1,840 ms | Load Duration: 1,420 ms | Render Delay: 350 ms",
      );
      expect(output).toContain("Rect: 800x400 at (50, 100)");
    });

    test("includes CLS culprits with selector, shift score, and causes", () => {
      const output = formatAgentMarkdown(sampleNormalizedRun, "mobile");
      expect(output).toContain("header > div.announcement-bar");
      expect(output).toContain("Shift Score: 0.142");
      expect(output).toContain(
        "Injected after initial paint without reserved space",
      );
    });

    test("includes prioritized insight diagnostics and failed audits", () => {
      const output = formatAgentMarkdown(sampleNormalizedRun, "mobile");
      expect(output).toContain("Reduce unused JavaScript");
      expect(output).toContain("Est savings: 620 ms");
      expect(output).toContain("Buttons do not have an accessible name");
    });

    test("sorts multiple insights by total metric savings in agent markdown", () => {
      const multiInsightRun: NormalizedLighthouseRun = {
        ...sampleNormalizedRun,
        summary: {
          ...sampleNormalizedRun.summary,
          insights: [
            {
              id: "lower-savings",
              title: "Lower savings insight",
              description: "Saves a little.",
              score: 0.8,
              scoreDisplayMode: "numeric",
              displayValue: "100 ms",
              metricSavings: { LCP: 100 },
              replacesAudits: [],
            },
            {
              id: "higher-savings",
              title: "Higher savings insight",
              description: "Saves a lot.",
              score: 0.2,
              scoreDisplayMode: "numeric",
              displayValue: "1000 ms",
              metricSavings: { LCP: 1000 },
              replacesAudits: [],
            },
          ],
        },
      };

      const output = formatAgentMarkdown(multiInsightRun, "desktop");
      const higherIdx = output.indexOf("Higher savings insight");
      const lowerIdx = output.indexOf("Lower savings insight");
      expect(higherIdx).toBeLessThan(lowerIdx);
    });

    test("respects token budget (stays well under 500 tokens / 2,500 chars)", () => {
      const output = formatAgentMarkdown(sampleNormalizedRun, "mobile");
      expect(output.length).toBeLessThan(3000);
    });

    test("accepts a LighthouseRunRow directly", () => {
      const output = formatAgentMarkdown(sampleRow2);
      // oxlint-disable-next-line no-control-regex
      expect(/\u001b\[/.test(output)).toBe(false);
      expect(output).toContain(
        "# Lighthouse Audit: https://example.com/ (mobile)",
      );
      expect(output).toContain("Performance: 85");
    });
  });

  describe("formatTerminalSummary", () => {
    test("formats colored summary table for current audit run", () => {
      const output = formatTerminalSummary(sampleNormalizedRun);
      expect(output).toContain("https://example.com/");
      expect(output).toContain("78");
      expect(output).toContain("3,820 ms");
      expect(output).toContain("0.185");
      expect(output).toContain("Reduce unused JavaScript");
    });

    test("renders low score badges and zero or negative deltas", () => {
      const lowScoreRun: NormalizedLighthouseRun = {
        ...sampleNormalizedRun,
        scores: {
          performanceScore: 40,
          accessibilityScore: 60,
          bestPracticesScore: 70,
          seoScore: 80,
        },
        metrics: {
          ...sampleNormalizedRun.metrics,
          lcpMs: 5000,
          cls: 0.3,
        },
      };

      const baselineRow: LighthouseRunRow = {
        ...sampleRow1,
        performanceScore: 50, // delta is -10 (negative)
        accessibilityScore: 60, // delta is 0
        lcpMs: 4000, // delta is +1000 ms (regression)
        cls: 0.3, // delta is 0
      };

      const output = formatTerminalSummary(lowScoreRun, baselineRow);
      expect(output).toContain("40");
      expect(output).toContain("(-10)");
      expect(output).toContain("(0)");
      expect(output).toContain("(+1,000 ms)");
    });

    test("renders inline deltas when previous run is supplied", () => {
      const output = formatTerminalSummary(sampleNormalizedRun, sampleRow1);
      // Perf improved from 70 to 78 (+8)
      expect(output).toContain("+8");
      // LCP improved from 4200 to 3820 (-380 ms)
      expect(output).toContain("-380 ms");
      // CLS improved from 0.22 to 0.185 (-0.035)
      expect(output).toContain("-0.035");
    });
  });

  describe("formatTerminalList", () => {
    test("formats array of run rows into an aligned table", () => {
      const output = formatTerminalList([sampleRow1, sampleRow2]);
      expect(output).toContain("3f74b419");
      expect(output).toContain("8c91a723");
      expect(output).toContain("mobile");
      expect(output).toContain("https://example.com/");
    });

    test("handles empty list with clear message", () => {
      const output = formatTerminalList([]);
      expect(output).toContain("No audit runs found");
    });
  });

  describe("formatTerminalDiff", () => {
    test("formats pairwise audit comparison with deltas", () => {
      const output = formatTerminalDiff(sampleRow1, sampleRow2);
      expect(output).toContain("Baseline:   3f74b419");
      expect(output).toContain("Comparison: 8c91a723");
      expect(output).toContain("Performance");
      expect(output).toContain("+15");
      expect(output).toContain("-1,800 ms");
      expect(output).toContain("-0.140");
    });
  });

  describe("formatJson", () => {
    test("returns formatted JSON string", () => {
      const json = formatJson({ hello: "world" });
      expect(JSON.parse(json)).toEqual({ hello: "world" });
    });
  });
});
