import { beforeEach, describe, expect, it } from "bun:test";
import {
  createDb,
  runMigrations,
  type DevtoolsDb,
  type NewLighthouseRunRow,
} from "@devtools/db";
import {
  findPreviousLighthouseRun,
  getLighthouseRunById,
  insertLighthouseRun,
  listLighthouseRuns,
} from "../src/repository";

function makeSampleRow(
  overrides: Partial<NewLighthouseRunRow> = {},
): NewLighthouseRunRow {
  return {
    id: overrides.id ?? "run-1",
    url: overrides.url ?? "https://example.com",
    finalUrl: overrides.finalUrl ?? "https://example.com/",
    formFactor: overrides.formFactor ?? "mobile",
    throttlingMethod: overrides.throttlingMethod ?? "simulate",
    performanceScore: overrides.performanceScore ?? 94,
    accessibilityScore: overrides.accessibilityScore ?? 100,
    bestPracticesScore: overrides.bestPracticesScore ?? 92,
    seoScore: overrides.seoScore ?? 98,
    lcpMs: overrides.lcpMs ?? 1240,
    cls: overrides.cls ?? 0.02,
    tbtMs: overrides.tbtMs ?? 45,
    fcpMs: overrides.fcpMs ?? 780,
    siMs: overrides.siMs ?? 1150,
    ttfbMs: overrides.ttfbMs ?? 95,
    summaryJson: overrides.summaryJson ?? {
      lcpElement: null,
      lcpPhases: null,
      clsCulprits: [],
      insights: [],
      failedAudits: [],
      runWarnings: [],
      runtimeError: null,
      medianMetadata: null,
    },
    jsonReportPath: overrides.jsonReportPath ?? "/tmp/run-1/report.json",
    htmlReportPath: overrides.htmlReportPath ?? "/tmp/run-1/report.html",
    durationMs: overrides.durationMs ?? 4100,
    createdAt: overrides.createdAt ?? new Date("2026-10-29T20:00:00Z"),
  };
}

describe("Lighthouse Repository (Drizzle SQLite persistence)", () => {
  let db: DevtoolsDb;

  beforeEach(() => {
    db = createDb({ path: ":memory:" });
    runMigrations(db);
  });

  it("inserts a canonical LighthouseRunRow and retrieves it by ID", () => {
    const inserted = insertLighthouseRun(db, makeSampleRow({ id: "run-abc" }));
    expect(inserted.id).toBe("run-abc");
    expect(inserted.performanceScore).toBe(94);

    const found = getLighthouseRunById(db, "run-abc");
    expect(found).toEqual(inserted);
    expect(getLighthouseRunById(db, "non-existent")).toBeNull();
  });

  it("lists runs ordered by createdAt descending with url, formFactor, limit, and offset filters", () => {
    insertLighthouseRun(
      db,
      makeSampleRow({
        id: "r1",
        url: "https://example.com",
        formFactor: "mobile",
        createdAt: new Date("2026-10-29T10:00:00Z"),
      }),
    );
    insertLighthouseRun(
      db,
      makeSampleRow({
        id: "r2",
        url: "https://example.com",
        formFactor: "desktop",
        createdAt: new Date("2026-10-29T11:00:00Z"),
      }),
    );
    insertLighthouseRun(
      db,
      makeSampleRow({
        id: "r3",
        url: "https://other.dev",
        formFactor: "mobile",
        createdAt: new Date("2026-10-29T12:00:00Z"),
      }),
    );

    const all = listLighthouseRuns(db);
    expect(all.map((r) => r.id)).toEqual(["r3", "r2", "r1"]);

    const filteredByUrl = listLighthouseRuns(db, {
      url: "https://example.com",
    });
    expect(filteredByUrl.map((r) => r.id)).toEqual(["r2", "r1"]);

    const filteredByBoth = listLighthouseRuns(db, {
      url: "https://example.com",
      formFactor: "mobile",
    });
    expect(filteredByBoth.map((r) => r.id)).toEqual(["r1"]);

    const paginated = listLighthouseRuns(db, { limit: 1, offset: 1 });
    expect(paginated.map((r) => r.id)).toEqual(["r2"]);
  });

  it("finds the most recent previous run for the same URL and formFactor excluding excludeId", () => {
    insertLighthouseRun(
      db,
      makeSampleRow({
        id: "old-mobile",
        url: "https://example.com",
        formFactor: "mobile",
        createdAt: new Date("2026-10-29T10:00:00Z"),
      }),
    );
    insertLighthouseRun(
      db,
      makeSampleRow({
        id: "prev-mobile",
        url: "https://example.com",
        formFactor: "mobile",
        createdAt: new Date("2026-10-29T11:00:00Z"),
      }),
    );
    insertLighthouseRun(
      db,
      makeSampleRow({
        id: "curr-mobile",
        url: "https://example.com",
        formFactor: "mobile",
        createdAt: new Date("2026-10-29T12:00:00Z"),
      }),
    );

    const prevWithExclude = findPreviousLighthouseRun(db, {
      url: "https://example.com",
      formFactor: "mobile",
      excludeId: "curr-mobile",
    });
    expect(prevWithExclude?.id).toBe("prev-mobile");

    const latestWithoutExclude = findPreviousLighthouseRun(db, {
      url: "https://example.com",
      formFactor: "mobile",
    });
    expect(latestWithoutExclude?.id).toBe("curr-mobile");

    const noneForDesktop = findPreviousLighthouseRun(db, {
      url: "https://example.com",
      formFactor: "desktop",
    });
    expect(noneForDesktop).toBeNull();
  });
});
