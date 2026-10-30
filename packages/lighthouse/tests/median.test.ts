import { describe, expect, it } from "bun:test";
import { computeRepresentativeRun } from "../src/median";
import type { SingleIterationResult } from "../src/types";

function makeIteration(
  fcpMs: number,
  interactiveMs?: number,
  tbtMs?: number,
  id = "run",
): SingleIterationResult {
  return {
    lhr: {
      requestedUrl: "https://example.com",
      audits: {
        "first-contentful-paint": { numericValue: fcpMs },
        ...(typeof interactiveMs === "number"
          ? { interactive: { numericValue: interactiveMs } }
          : {}),
        ...(typeof tbtMs === "number"
          ? { "total-blocking-time": { numericValue: tbtMs } }
          : {}),
      },
    },
    reportJson: JSON.stringify({ id, fcpMs }),
    reportHtml: `<html>${id}:${fcpMs}</html>`,
  };
}

describe("computeRepresentativeRun (Euclidean distance to median FCP and TTI)", () => {
  it("throws an error when passed an empty runs array", () => {
    expect(() => computeRepresentativeRun([])).toThrow(
      "Cannot compute a representative run from an empty runs array",
    );
  });

  it("returns the single run with null medianMetadata when runs.length === 1", () => {
    const single = makeIteration(820, 1450, 50, "only");
    const result = computeRepresentativeRun([single]);

    expect(result.representative).toBe(single);
    expect(result.runIndex).toBe(0);
    expect(result.medianMetadata).toBeNull();
  });

  it("selects the single real run closest to median FCP and median Interactive across N runs without synthesizing a Frankenstein run", () => {
    // Run 0: FCP=1200 (slow FCP), TTI=1800 (median TTI)
    // Run 1: FCP=700 (fast FCP), TTI=2500 (slow TTI)
    // Run 2: FCP=910, TTI=1820 -> closest to medianFcp=910 and medianInteractive=1820!
    // Run 3: FCP=900, TTI=1400 (fast TTI)
    // Run 4: FCP=1500, TTI=3000
    // Sorted FCPs: [700, 900, 910, 1200, 1500] -> index 2 = 910
    // Sorted TTIs: [1400, 1800, 1820, 2500, 3000] -> index 2 = 1820
    const runs = [
      makeIteration(1200, 1800, 100, "r0"),
      makeIteration(700, 2500, 300, "r1"),
      makeIteration(910, 1820, 110, "r2-median"),
      makeIteration(900, 1400, 40, "r3"),
      makeIteration(1500, 3000, 450, "r4"),
    ];

    const result = computeRepresentativeRun(runs);
    expect(result.runIndex).toBe(2);
    expect(result.representative).toBe(runs[2]!);
    expect(result.representative.reportHtml).toBe("<html>r2-median:910</html>");
    expect(result.medianMetadata).toEqual({
      totalRuns: 5,
      selectedRunIndex: 2,
      medianFcpMs: 910,
      medianInteractiveMs: 1820,
      runDistances: [
        {
          runIndex: 0,
          fcpMs: 1200,
          interactiveMs: 1800,
          distanceSquared: (1200 - 910) ** 2 + (1800 - 1820) ** 2,
        },
        {
          runIndex: 1,
          fcpMs: 700,
          interactiveMs: 2500,
          distanceSquared: (700 - 910) ** 2 + (2500 - 1820) ** 2,
        },
        {
          runIndex: 2,
          fcpMs: 910,
          interactiveMs: 1820,
          distanceSquared: 0,
        },
        {
          runIndex: 3,
          fcpMs: 900,
          interactiveMs: 1400,
          distanceSquared: (900 - 910) ** 2 + (1400 - 1820) ** 2,
        },
        {
          runIndex: 4,
          fcpMs: 1500,
          interactiveMs: 3000,
          distanceSquared: (1500 - 910) ** 2 + (3000 - 1820) ** 2,
        },
      ],
    });
  });

  it("falls back to total-blocking-time (or 0) when interactive is 0 or missing", () => {
    const runs = [
      makeIteration(1000, 0, 250, "r0"),
      makeIteration(800, undefined, 90, "r1"),
      makeIteration(900, 0, 120, "r2"),
      {
        lhr: { audits: {} },
        reportJson: "{}",
        reportHtml: "<html>empty</html>",
      },
    ];

    const result = computeRepresentativeRun(runs);
    // FCPs: [0, 800, 900, 1000] -> index 2 = 900
    // Interactive/TBTs: [0, 90, 120, 250] -> index 2 = 120
    // Run 2 has FCP=900, TBT=120 -> distanceSquared = 0
    expect(result.runIndex).toBe(2);
    expect(result.medianMetadata?.medianFcpMs).toBe(900);
    expect(result.medianMetadata?.medianInteractiveMs).toBe(120);
  });
});
