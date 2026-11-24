import { describe, expect, it } from "vitest";
import {
  LighthouseCategoryIdSchema,
  LighthouseFormFactorSchema,
  LighthouseProgressStageSchema,
  type LighthouseRunListItem,
  LighthouseThrottlingMethodSchema,
} from "@devtools/lighthouse/schemas";
import {
  ACTIVE_PROGRESS_STAGE_ORDER,
  buildActiveJobUrl,
  buildCompareUrl,
  buildHistoryUrl,
  buildRunDetailUrl,
  CATEGORY_LABELS,
  computeAuditProgressPercent,
  computeDelta,
  extractDistinctUrls,
  formatCwvValue,
  formatDurationMs,
  formatShortTimestamp,
  formatTimestamp,
  FORM_FACTOR_LABELS,
  getCwvBarPositionPercent,
  getCwvRating,
  getCwvTone,
  getScoreTone,
  isFailingInsight,
  PROGRESS_STAGE_LABELS,
  PROGRESS_STAGE_ORDER,
  selectDefaultCompareSelection,
  shortRunId,
  shortUrlLabel,
  THROTTLING_METHOD_LABELS,
} from "./thresholds";

function makeRun(
  overrides: Partial<LighthouseRunListItem> & {
    id: string;
    url: string;
    createdAt: string;
  },
): LighthouseRunListItem {
  return {
    finalUrl: overrides.url,
    formFactor: "mobile",
    throttlingMethod: "simulate",
    performanceScore: 90,
    accessibilityScore: 95,
    bestPracticesScore: 96,
    seoScore: 98,
    lcpMs: 2000,
    cls: 0.05,
    tbtMs: 120,
    fcpMs: 1100,
    siMs: 1900,
    ttfbMs: 300,
    durationMs: 4200,
    hasHtmlReport: true,
    ...overrides,
  };
}

describe("lighthouse-run thresholds and formatting helpers", () => {
  it("maps category scores to semantic tones across exact thresholds", () => {
    expect(getScoreTone(null)).toBe("neutral");
    expect(getScoreTone(95)).toBe("success");
    expect(getScoreTone(90)).toBe("success");
    expect(getScoreTone(89)).toBe("warning");
    expect(getScoreTone(72)).toBe("warning");
    expect(getScoreTone(50)).toBe("warning");
    expect(getScoreTone(49)).toBe("destructive");
  });

  it("evaluates Core Web Vitals ratings, tones, marker percentages, and formatted values", () => {
    expect(getCwvRating("lcpMs", null)).toBe("unknown");
    expect(getCwvRating("lcpMs", 2500)).toBe("good");
    expect(getCwvRating("lcpMs", 2501)).toBe("needs-improvement");
    expect(getCwvRating("lcpMs", 4000)).toBe("needs-improvement");
    expect(getCwvRating("lcpMs", 4001)).toBe("poor");
    expect(getCwvRating("cls", 0.1)).toBe("good");
    expect(getCwvRating("cls", 0.101)).toBe("needs-improvement");
    expect(getCwvRating("cls", 0.25)).toBe("needs-improvement");
    expect(getCwvRating("cls", 0.251)).toBe("poor");

    expect(getCwvTone("good")).toBe("success");
    expect(getCwvTone("needs-improvement")).toBe("warning");
    expect(getCwvTone("poor")).toBe("destructive");
    expect(getCwvTone("unknown")).toBe("neutral");

    expect(getCwvBarPositionPercent("lcpMs", null)).toBe(0);
    expect(getCwvBarPositionPercent("lcpMs", 1250)).toBe(25);
    expect(getCwvBarPositionPercent("lcpMs", 3250)).toBe(62.5);
    expect(getCwvBarPositionPercent("lcpMs", 5500)).toBeGreaterThan(75);

    expect(formatCwvValue("lcpMs", null)).toBe("N/A");
    expect(formatCwvValue("cls", 0.042)).toBe("0.042");
    expect(formatCwvValue("tbtMs", 1000)).toBe("1.00 s");
    expect(formatCwvValue("tbtMs", 999)).toBe("999 ms");
    expect(formatCwvValue("lcpMs", 2400)).toBe("2.40 s");
    expect(formatCwvValue("tbtMs", 185)).toBe("185 ms");
  });

  it("formats durations, timestamps, short URLs, and short IDs", () => {
    expect(formatDurationMs(4200)).toBe("4.2s");
    expect(formatDurationMs(1000)).toBe("1.0s");
    expect(formatDurationMs(999)).toBe("999ms");
    expect(formatDurationMs(650)).toBe("650ms");

    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
    expect(formatTimestamp("2026-11-22T10:30:00.000Z")).toContain("Nov");

    expect(formatShortTimestamp("not-a-date")).toBe("not-a-date");
    expect(formatShortTimestamp("2026-11-22T10:30:00.000Z")).toContain("Nov");

    expect(shortUrlLabel("https://shop.example.com/")).toBe(
      "shop.example.com/",
    );
    expect(shortUrlLabel("https://shop.example.com/checkout?step=2")).toBe(
      "shop.example.com/checkout?step=2",
    );
    expect(shortUrlLabel("invalid url")).toBe("invalid url");
    expect(shortRunId("run-1234567890")).toBe("run-1234");
  });

  it("evaluates failing insights independently across score and metric savings clauses and computes numeric deltas", () => {
    expect(
      isFailingInsight({
        id: "score-only-insight",
        title: "Low score",
        description: "desc",
        score: 0.89,
        scoreDisplayMode: "numeric",
        displayValue: null,
        metricSavings: {},
        replacesAudits: [],
      }),
    ).toBe(true);

    expect(
      isFailingInsight({
        id: "savings-only-insight",
        title: "High savings",
        description: "desc",
        score: null,
        scoreDisplayMode: "metricSavings",
        displayValue: "51 ms",
        metricSavings: { LCP: 51 },
        replacesAudits: [],
      }),
    ).toBe(true);

    expect(
      isFailingInsight({
        id: "boundary-pass-insight",
        title: "Boundary passing",
        description: "desc",
        score: 0.9,
        scoreDisplayMode: "metricSavings",
        displayValue: "50 ms",
        metricSavings: { LCP: 50 },
        replacesAudits: [],
      }),
    ).toBe(false);

    expect(computeDelta(95, 80)).toBe(15);
    expect(computeDelta(null, 80)).toBeNull();
    expect(computeDelta(80, null)).toBeNull();
    expect(computeDelta(0.15, 0.05)).toBe(0.1);
  });

  it("extracts distinct URLs, picks default compare runs capped at 4, and builds static routes", () => {
    expect(selectDefaultCompareSelection([])).toEqual({
      runIds: [],
      baselineId: null,
    });

    const r1 = makeRun({
      id: "r1",
      url: "https://a.example.com/",
      createdAt: "2026-11-20T10:00:00.000Z",
    });
    const r2 = makeRun({
      id: "r2",
      url: "https://b.example.com/checkout",
      createdAt: "2026-11-21T10:00:00.000Z",
    });
    const r3 = makeRun({
      id: "r3",
      url: "https://a.example.com/",
      createdAt: "2026-11-22T10:00:00.000Z",
    });

    const distinct = extractDistinctUrls([r3, r2, r1]);
    expect(distinct).toEqual([
      { url: "https://a.example.com/", label: "a.example.com/", count: 2 },
      {
        url: "https://b.example.com/checkout",
        label: "b.example.com/checkout",
        count: 1,
      },
    ]);

    expect(selectDefaultCompareSelection([r3, r2, r1])).toEqual({
      runIds: ["r1", "r3"],
      baselineId: "r1",
    });

    expect(selectDefaultCompareSelection([r2, r1])).toEqual({
      runIds: ["r1", "r2"],
      baselineId: "r1",
    });

    const fiveDistinctRuns = [
      makeRun({
        id: "u5",
        url: "https://5.example.com/",
        createdAt: "2026-11-25T10:00:00.000Z",
      }),
      makeRun({
        id: "u4",
        url: "https://4.example.com/",
        createdAt: "2026-11-24T10:00:00.000Z",
      }),
      makeRun({
        id: "u3",
        url: "https://3.example.com/",
        createdAt: "2026-11-23T10:00:00.000Z",
      }),
      makeRun({
        id: "u2",
        url: "https://2.example.com/",
        createdAt: "2026-11-22T10:00:00.000Z",
      }),
      makeRun({
        id: "u1",
        url: "https://1.example.com/",
        createdAt: "2026-11-21T10:00:00.000Z",
      }),
    ];
    expect(selectDefaultCompareSelection(fiveDistinctRuns)).toEqual({
      runIds: ["u2", "u3", "u4", "u5"],
      baselineId: "u2",
    });

    expect(buildHistoryUrl()).toBe("/lighthouse");
    expect(buildCompareUrl()).toBe("/lighthouse/compare");
    expect(buildCompareUrl({ runIds: ["r1", "r2"], baselineId: "r1" })).toBe(
      "/lighthouse/compare?runs=r1%2Cr2&baseline=r1",
    );
    expect(buildRunDetailUrl("r1")).toBe("/lighthouse/run?id=r1");
    expect(buildRunDetailUrl("r1", "report")).toBe(
      "/lighthouse/run?id=r1&tab=report",
    );
    expect(buildActiveJobUrl("job-99")).toBe("/lighthouse/run?job=job-99");

    expect(new Set(Object.keys(CATEGORY_LABELS))).toEqual(
      new Set(LighthouseCategoryIdSchema.options),
    );
    expect(new Set(Object.keys(FORM_FACTOR_LABELS))).toEqual(
      new Set(LighthouseFormFactorSchema.options),
    );
    expect(new Set(Object.keys(THROTTLING_METHOD_LABELS))).toEqual(
      new Set(LighthouseThrottlingMethodSchema.options),
    );
    expect(new Set(PROGRESS_STAGE_ORDER)).toEqual(
      new Set(LighthouseProgressStageSchema.options),
    );
    expect(new Set(Object.keys(PROGRESS_STAGE_LABELS))).toEqual(
      new Set(PROGRESS_STAGE_ORDER),
    );
  });

  it("exposes 5 active progress stages and computes strictly monotonic single-run and multi-run percentages", () => {
    expect(ACTIVE_PROGRESS_STAGE_ORDER).toEqual([
      "locating_browser",
      "launching_browser",
      "navigating",
      "analyzing",
      "generating_report",
    ]);
    expect(ACTIVE_PROGRESS_STAGE_ORDER).not.toContain("complete");

    // Single-run: 20, 40, 60, 80, 100
    expect(
      ACTIVE_PROGRESS_STAGE_ORDER.map((stage) =>
        computeAuditProgressPercent(stage, 0, 1),
      ),
    ).toEqual([20, 40, 60, 80, 100]);

    // Multi-run (3 iterations): 11 transitions must be strictly increasing
    const multiRunSequence = [
      computeAuditProgressPercent("locating_browser", 0, 3),
      computeAuditProgressPercent("launching_browser", 0, 3),
      computeAuditProgressPercent("navigating", 0, 3),
      computeAuditProgressPercent("analyzing", 0, 3),
      computeAuditProgressPercent("launching_browser", 1, 3),
      computeAuditProgressPercent("navigating", 1, 3),
      computeAuditProgressPercent("analyzing", 1, 3),
      computeAuditProgressPercent("launching_browser", 2, 3),
      computeAuditProgressPercent("navigating", 2, 3),
      computeAuditProgressPercent("analyzing", 2, 3),
      computeAuditProgressPercent("generating_report", 2, 3),
    ];
    for (let i = 1; i < multiRunSequence.length; i += 1) {
      expect(multiRunSequence[i]).toBeGreaterThan(multiRunSequence[i - 1]!);
    }
    expect(multiRunSequence[0]).toBeGreaterThan(0);
    expect(multiRunSequence.at(-1)).toBe(100);

    // Clamps out-of-range runIndex and treats complete as 100
    expect(computeAuditProgressPercent("analyzing", 99, 3)).toBe(
      computeAuditProgressPercent("analyzing", 2, 3),
    );
    expect(computeAuditProgressPercent("complete", 0, 3)).toBe(100);
  });
});
