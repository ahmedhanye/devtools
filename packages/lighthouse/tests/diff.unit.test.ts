import { describe, expect, it } from "bun:test";
import type { LighthouseRunRow } from "@devtools/db";
import { computeInsightDiff, computeRunDeltas, parseRunSummary } from "../src";

function makeSummary(
  overrides: Partial<NonNullable<ReturnType<typeof parseRunSummary>>> = {},
) {
  return {
    lcpElement: null,
    lcpPhases: null,
    clsCulprits: [],
    insights: [],
    failedAudits: [],
    runWarnings: [],
    runtimeError: null,
    medianMetadata: null,
    ...overrides,
  };
}

const DEFAULT_RUN_ROW: LighthouseRunRow = {
  id: "run-1",
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  performanceScore: 80,
  accessibilityScore: 90,
  bestPracticesScore: 95,
  seoScore: 100,
  lcpMs: 2000,
  cls: 0.1,
  tbtMs: 150,
  fcpMs: 1000,
  siMs: 1800,
  ttfbMs: 200,
  summaryJson: makeSummary(),
  jsonReportPath: "/tmp/run-1/report.json",
  htmlReportPath: "/tmp/run-1/report.html",
  durationMs: 3000,
  createdAt: new Date("2026-11-10T20:00:00Z"),
};

function makeRunRow(
  overrides: Partial<LighthouseRunRow> = {},
): LighthouseRunRow {
  return { ...DEFAULT_RUN_ROW, ...overrides };
}

describe("Lighthouse Shared Diff & Summary Helpers", () => {
  describe("parseRunSummary", () => {
    it("parses valid summary objects and JSON strings, returning null for malformed inputs", () => {
      const valid = makeSummary();
      expect(parseRunSummary(valid)).toEqual(valid);
      expect(parseRunSummary(JSON.stringify(valid))).toEqual(valid);
      expect(parseRunSummary(null)).toBeNull();
      expect(parseRunSummary(undefined)).toBeNull();
      expect(parseRunSummary("not-valid-json")).toBeNull();
      expect(parseRunSummary({ unexpected: true })).toBeNull();
    });
  });

  describe("computeInsightDiff", () => {
    it("handles missing or one-sided null summaries and classifies score: null and multi-key savings", () => {
      expect(computeInsightDiff(null, null)).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: null,
      });

      const insightBase = {
        description: "desc",
        scoreDisplayMode: "numeric",
        displayValue: null,
        replacesAudits: [],
      };
      const culprit = {
        element: {
          selector: ".hero",
          snippet: null,
          nodeLabel: null,
          path: null,
          lhId: null,
          boundingRect: null,
        },
        score: 0.05,
        causes: [],
      };

      const s1 = makeSummary({
        insights: [
          {
            ...insightBase,
            id: "unused-js",
            title: "Unused JS",
            score: 0.4,
            metricSavings: { LCP: 500 },
          },
          {
            ...insightBase,
            id: "passing-edge",
            title: "Passing Edge",
            score: 0.9,
            metricSavings: { LCP: 50 },
          },
          {
            ...insightBase,
            id: "informative-null-s1",
            title: "Null Score Informative S1",
            score: null,
            metricSavings: {},
          },
        ],
        clsCulprits: [culprit, culprit],
      });

      expect(computeInsightDiff(s1, null)).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: null,
      });
      expect(computeInsightDiff(null, s1)).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: null,
      });

      const s2 = makeSummary({
        insights: [
          {
            ...insightBase,
            id: "unused-js",
            title: "Unused JS",
            score: 1.0,
            metricSavings: {},
          },
          {
            ...insightBase,
            id: "passing-edge",
            title: "Passing Edge",
            score: 1.0,
            metricSavings: { FCP: 10, LCP: 60 },
          },
          {
            ...insightBase,
            id: "informative-null-s2",
            title: "Null Score Informative S2",
            score: null,
            metricSavings: {},
          },
        ],
        clsCulprits: [culprit],
      });

      const diff = computeInsightDiff(s1, s2);
      expect(diff.resolved).toEqual([{ id: "unused-js", title: "Unused JS" }]);
      expect(diff.regressed).toEqual([
        { id: "passing-edge", title: "Passing Edge" },
      ]);
      expect(diff.clsCulpritDelta).toBe(-1);
    });
  });

  describe("computeRunDeltas", () => {
    it("computes score, CWV, and insight deltas across all 10 fields including 0 and null values", () => {
      const baseline = makeRunRow({
        performanceScore: 70,
        accessibilityScore: null,
        bestPracticesScore: 80,
        seoScore: 85,
        lcpMs: 2500,
        cls: null,
        tbtMs: 150,
        fcpMs: 0,
        siMs: 2100,
        ttfbMs: 300,
      });
      const comparison = makeRunRow({
        id: "run-2",
        performanceScore: 92,
        accessibilityScore: 100,
        bestPracticesScore: 0,
        seoScore: 98,
        lcpMs: 1800,
        cls: 0.02,
        tbtMs: 50,
        fcpMs: 950,
        siMs: 1500,
        ttfbMs: 120,
      });

      const deltas = computeRunDeltas(baseline, comparison);
      expect(deltas.scores).toEqual({
        performanceScore: 22,
        accessibilityScore: null,
        bestPracticesScore: -80,
        seoScore: 13,
      });
      expect(deltas.metrics).toEqual({
        lcpMs: -700,
        cls: null,
        tbtMs: -100,
        fcpMs: 950,
        siMs: -600,
        ttfbMs: -180,
      });
      expect(deltas.insights).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: 0,
      });
    });

    it("returns null deltas when comparison fields are null while baseline fields are numeric", () => {
      const baseline = makeRunRow({
        performanceScore: 80,
        accessibilityScore: 90,
        bestPracticesScore: 95,
        seoScore: 85,
        lcpMs: 2000,
        cls: 0.05,
        tbtMs: 120,
        fcpMs: 900,
        siMs: 1600,
        ttfbMs: 150,
      });
      const comparison = makeRunRow({
        id: "run-null-comparison",
        performanceScore: null,
        accessibilityScore: null,
        bestPracticesScore: null,
        seoScore: null,
        lcpMs: null,
        cls: null,
        tbtMs: null,
        fcpMs: null,
        siMs: null,
        ttfbMs: null,
      });

      const deltas = computeRunDeltas(baseline, comparison);
      expect(deltas.scores).toEqual({
        performanceScore: null,
        accessibilityScore: null,
        bestPracticesScore: null,
        seoScore: null,
      });
      expect(deltas.metrics).toEqual({
        lcpMs: null,
        cls: null,
        tbtMs: null,
        fcpMs: null,
        siMs: null,
        ttfbMs: null,
      });
    });

    it("satisfies self-diff identity and antisymmetry invariants", () => {
      const runA = makeRunRow({
        id: "run-a",
        performanceScore: 70,
        accessibilityScore: 80,
        bestPracticesScore: 85,
        seoScore: 90,
        lcpMs: 2200,
        cls: 0.15,
        tbtMs: 180,
        fcpMs: 1200,
        siMs: 1900,
        ttfbMs: 250,
      });
      const runB = makeRunRow({
        id: "run-b",
        performanceScore: 95,
        accessibilityScore: 98,
        bestPracticesScore: 92,
        seoScore: 100,
        lcpMs: 1100,
        cls: 0.02,
        tbtMs: 20,
        fcpMs: 700,
        siMs: 1100,
        ttfbMs: 80,
      });

      const selfDiff = computeRunDeltas(runA, runA);
      expect(selfDiff.scores).toEqual({
        performanceScore: 0,
        accessibilityScore: 0,
        bestPracticesScore: 0,
        seoScore: 0,
      });
      expect(selfDiff.metrics).toEqual({
        lcpMs: 0,
        cls: 0,
        tbtMs: 0,
        fcpMs: 0,
        siMs: 0,
        ttfbMs: 0,
      });
      expect(selfDiff.insights).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: 0,
      });

      const ab = computeRunDeltas(runA, runB);
      const ba = computeRunDeltas(runB, runA);
      expect(ab.scores.performanceScore).toBe(-ba.scores.performanceScore!);
      expect(ab.scores.seoScore).toBe(-ba.scores.seoScore!);
      expect(ab.metrics.lcpMs).toBe(-ba.metrics.lcpMs!);
      expect(ab.metrics.fcpMs).toBe(-ba.metrics.fcpMs!);
      expect(ab.metrics.siMs).toBe(-ba.metrics.siMs!);
      expect(ab.metrics.ttfbMs).toBe(-ba.metrics.ttfbMs!);
    });
  });
});
