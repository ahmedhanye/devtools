import type { LighthouseRunListItem } from "@devtools/lighthouse/schemas";
import { describe, expect, it, vi } from "vitest";
import {
  buildChartInspectHandlers,
  extractAreaClickRunId,
  extractBarClickRunId,
  getChronologicalSelectedRuns,
  parseCompareRunsParam,
  resolveEffectiveCompareSelection,
  selectLatestRunPerUrl,
  selectRunsForUrls,
  sortCompareRuns,
} from "./compare-helpers";

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
    bestPracticesScore: 95,
    seoScore: 98,
    lcpMs: 2100,
    cls: 0.04,
    tbtMs: 110,
    fcpMs: 1000,
    siMs: 1700,
    ttfbMs: 260,
    durationMs: 3900,
    hasHtmlReport: true,
    ...overrides,
  };
}

describe("compare-helpers", () => {
  const r1 = makeRun({
    id: "r1",
    url: "https://a.example.com/",
    createdAt: "2026-11-20T10:00:00.000Z",
    performanceScore: 72,
    lcpMs: 3400,
  });
  const r2 = makeRun({
    id: "r2",
    url: "https://b.example.com/checkout",
    createdAt: "2026-11-21T10:00:00.000Z",
    formFactor: "desktop",
    performanceScore: null,
    lcpMs: null,
  });
  const r3 = makeRun({
    id: "r3",
    url: "https://a.example.com/",
    createdAt: "2026-11-22T10:00:00.000Z",
    performanceScore: 94,
    lcpMs: 1750,
  });

  const available = [r3, r2, r1];
  const map = new Map(available.map((item) => [item.id, item]));

  it("parses comma-separated runs params cleanly without duplicates", () => {
    expect(parseCompareRunsParam(null)).toEqual([]);
    expect(parseCompareRunsParam(" r1, r2 , r1 , ")).toEqual(["r1", "r2"]);
  });

  it("resolves explicit params and default URL selection", () => {
    expect(
      resolveEffectiveCompareSelection({
        runsParam: "r2,r3",
        baselineParam: "r3",
        availableRuns: available,
      }),
    ).toEqual({
      runIds: ["r2", "r3"],
      baselineId: "r3",
      isExplicit: true,
    });

    expect(
      resolveEffectiveCompareSelection({
        runsParam: "r2,r3",
        baselineParam: "missing",
        availableRuns: available,
      }),
    ).toEqual({
      runIds: ["r2", "r3"],
      baselineId: "r2",
      isExplicit: true,
    });

    expect(
      resolveEffectiveCompareSelection({
        runsParam: "",
        baselineParam: null,
        availableRuns: available,
      }),
    ).toEqual({
      runIds: [],
      baselineId: null,
      isExplicit: true,
    });

    expect(
      resolveEffectiveCompareSelection({
        runsParam: null,
        baselineParam: "r3",
        availableRuns: available,
      }),
    ).toEqual({
      runIds: ["r1", "r3"],
      baselineId: "r3",
      isExplicit: false,
    });
  });

  it("filters chronologically by device and sorts metrics with nulls last", () => {
    expect(
      getChronologicalSelectedRuns(
        map,
        ["r3", "missing", "r2", "r1"],
        "mobile",
      ).map((item) => item.id),
    ).toEqual(["r1", "r3"]);

    expect(
      sortCompareRuns([r1, r2, r3], "createdAt", "desc").map((i) => i.id),
    ).toEqual(["r3", "r2", "r1"]);

    expect(
      sortCompareRuns([r2, r1, r3], "performanceScore", "asc").map((i) => i.id),
    ).toEqual(["r1", "r3", "r2"]);

    const r4 = makeRun({
      id: "r4",
      url: "https://a.example.com/",
      createdAt: "2026-11-19T10:00:00.000Z",
      performanceScore: null,
    });
    expect(
      sortCompareRuns([r2, r4], "performanceScore", "asc").map((i) => i.id),
    ).toEqual(["r2", "r4"]);

    expect(
      sortCompareRuns([r1, r2], "performanceScore", "desc").map((i) => i.id),
    ).toEqual(["r1", "r2"]);
  });

  it("selects latest run per URL and URL preset groups", () => {
    expect(selectLatestRunPerUrl(available, "all")).toEqual({
      runIds: ["r2", "r3"],
      baselineId: "r2",
    });
    expect(selectLatestRunPerUrl(available, "mobile")).toEqual({
      runIds: ["r3"],
      baselineId: "r3",
    });

    expect(
      selectRunsForUrls(available, ["https://a.example.com/"], "mobile"),
    ).toEqual({
      runIds: ["r1", "r3"],
      baselineId: "r1",
    });
    expect(selectLatestRunPerUrl([], "all")).toEqual({
      runIds: [],
      baselineId: null,
    });
    expect(selectRunsForUrls([], ["https://a.example.com/"], "all")).toEqual({
      runIds: [],
      baselineId: null,
    });
  });

  it("extracts run IDs safely from Recharts bar and area click events", () => {
    expect(extractBarClickRunId({ payload: { runId: "r1" } })).toBe("r1");
    expect(extractBarClickRunId({ payload: {} })).toBeNull();
    expect(extractBarClickRunId(null)).toBeNull();

    const data = [{ runId: "r1" }, { runId: "r2" }];
    expect(extractAreaClickRunId({ activeTooltipIndex: 1 }, data)).toBe("r2");
    expect(extractAreaClickRunId({ activeTooltipIndex: "0" }, data)).toBe("r1");
    expect(extractAreaClickRunId({ activeTooltipIndex: "1" }, data)).toBe("r2");
    expect(extractAreaClickRunId({ activeTooltipIndex: 9 }, data)).toBeNull();
    expect(extractAreaClickRunId({ activeTooltipIndex: "9" }, data)).toBeNull();
    expect(
      extractAreaClickRunId({ activeTooltipIndex: "foo" }, data),
    ).toBeNull();
    expect(extractAreaClickRunId({ activeTooltipIndex: -1 }, data)).toBeNull();
    expect(extractAreaClickRunId({ activeTooltipIndex: 1.5 }, data)).toBeNull();
    expect(
      extractAreaClickRunId({ activeTooltipIndex: null }, data),
    ).toBeNull();
    expect(extractAreaClickRunId({}, data)).toBeNull();
    expect(extractAreaClickRunId(null, data)).toBeNull();

    const onInspectRun = vi.fn();
    const handlers = buildChartInspectHandlers(data, onInspectRun);
    handlers.onBarClick({ payload: { runId: "r1" } });
    handlers.onBarClick(null);
    handlers.onAreaChartClick({ activeTooltipIndex: 1 });
    handlers.onAreaChartClick({ activeTooltipIndex: "0" });
    handlers.onAreaChartClick({ activeTooltipIndex: "foo" });
    handlers.onAreaChartClick({});
    expect(onInspectRun).toHaveBeenNthCalledWith(1, "r1");
    expect(onInspectRun).toHaveBeenNthCalledWith(2, "r2");
    expect(onInspectRun).toHaveBeenNthCalledWith(3, "r1");
    expect(onInspectRun).toHaveBeenCalledTimes(3);
  });
});
