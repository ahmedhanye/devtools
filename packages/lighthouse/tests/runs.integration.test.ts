import { beforeEach, describe, expect, it } from "bun:test";
import {
  createDb,
  runMigrations,
  type DevtoolsDb,
  type NewLighthouseRunRow,
} from "@devtools/db";
import { AmbiguousRunIdError, LighthouseRunNotFoundError } from "../src/errors";
import {
  countLighthouseRuns,
  findPreviousLighthouseRun,
  getLatestLighthouseRun,
  getLighthouseRunById,
  insertLighthouseRun,
  listLighthouseRuns,
  listLighthouseRunsWithTotal,
  MIN_PREFIX_LENGTH,
  resolveLighthouseRun,
} from "../src/runs";

const DEFAULT_SAMPLE_ROW: NewLighthouseRunRow = {
  id: "run-1",
  url: "https://example.com",
  finalUrl: "https://example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  performanceScore: 94,
  accessibilityScore: 100,
  bestPracticesScore: 92,
  seoScore: 98,
  lcpMs: 1240,
  cls: 0.02,
  tbtMs: 45,
  fcpMs: 780,
  siMs: 1150,
  ttfbMs: 95,
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
  jsonReportPath: "/tmp/run-1/report.json",
  htmlReportPath: "/tmp/run-1/report.html",
  durationMs: 4100,
  createdAt: new Date("2026-10-29T20:00:00Z"),
};

function makeSampleRow(
  overrides: Partial<NewLighthouseRunRow> = {},
): NewLighthouseRunRow {
  return { ...DEFAULT_SAMPLE_ROW, ...overrides };
}

describe("Lighthouse Runs Persistence (Drizzle SQLite)", () => {
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

  describe("resolveLighthouseRun", () => {
    it("resolves exact match by full UUID or exact ID", () => {
      const row = insertLighthouseRun(
        db,
        makeSampleRow({ id: "3f74b419-f027-4c07-b359-5f2105e46342" }),
      );
      const resolved = resolveLighthouseRun(
        db,
        "3f74b419-f027-4c07-b359-5f2105e46342",
      );
      expect(resolved.id).toBe(row.id);
    });

    it("resolves exact match even if ID length is less than MIN_PREFIX_LENGTH", () => {
      const row = insertLighthouseRun(db, makeSampleRow({ id: "short" }));
      const resolved = resolveLighthouseRun(db, "short");
      expect(resolved.id).toBe(row.id);
    });

    it("resolves a unique short ID prefix (>= 6 characters)", () => {
      const row = insertLighthouseRun(
        db,
        makeSampleRow({ id: "abcdef12-3456-7890-abcd-ef1234567890" }),
      );
      const resolved = resolveLighthouseRun(db, "abcdef");
      expect(resolved.id).toBe(row.id);
    });

    it("throws LighthouseRunNotFoundError when prefix is less than MIN_PREFIX_LENGTH and not exact", () => {
      insertLighthouseRun(
        db,
        makeSampleRow({ id: "abcdef12-3456-7890-abcd-ef1234567890" }),
      );
      expect(() => resolveLighthouseRun(db, "abcde")).toThrow(
        LighthouseRunNotFoundError,
      );
      expect(() => resolveLighthouseRun(db, "abcde")).toThrow(
        new RegExp(`Minimum ${MIN_PREFIX_LENGTH} characters required`),
      );
    });

    it("throws LighthouseRunNotFoundError when no matching record is found", () => {
      expect(() =>
        resolveLighthouseRun(db, "99999999-9999-9999-9999-999999999999"),
      ).toThrow(LighthouseRunNotFoundError);
      expect(() => resolveLighthouseRun(db, "999999")).toThrow(/not found/i);
    });

    it("throws AmbiguousRunIdError when short ID prefix matches multiple records", () => {
      insertLighthouseRun(
        db,
        makeSampleRow({ id: "abcdef11-0000-0000-0000-000000000000" }),
      );
      insertLighthouseRun(
        db,
        makeSampleRow({ id: "abcdef22-0000-0000-0000-000000000000" }),
      );

      expect(() => resolveLighthouseRun(db, "abcdef")).toThrow(
        AmbiguousRunIdError,
      );
      expect(() => resolveLighthouseRun(db, "abcdef")).toThrow(
        /Matches multiple runs/,
      );
    });

    it("escapes SQL wildcards (% and _) correctly during prefix lookup", () => {
      insertLighthouseRun(db, makeSampleRow({ id: "test-run-001" }));
      insertLighthouseRun(db, makeSampleRow({ id: "test%special-id" }));
      insertLighthouseRun(db, makeSampleRow({ id: "test_underscore-id" }));

      const matchPercent = resolveLighthouseRun(db, "test%spe");
      expect(matchPercent.id).toBe("test%special-id");

      const matchUnderscore = resolveLighthouseRun(db, "test_und");
      expect(matchUnderscore.id).toBe("test_underscore-id");

      expect(() => resolveLighthouseRun(db, "test%001")).toThrow(
        LighthouseRunNotFoundError,
      );
      expect(() => resolveLighthouseRun(db, "test_run")).toThrow(
        LighthouseRunNotFoundError,
      );
    });
  });

  describe("getLatestLighthouseRun", () => {
    it("resolves the most recent run ordered by createdAt descending", () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "run-first",
          createdAt: new Date("2026-11-04T10:00:00Z"),
        }),
      );
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "run-second",
          createdAt: new Date("2026-11-04T12:00:00Z"),
        }),
      );
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "run-third",
          createdAt: new Date("2026-11-04T11:00:00Z"),
        }),
      );

      const latest = getLatestLighthouseRun(db);
      expect(latest.id).toBe("run-second");
    });

    it("throws LighthouseRunNotFoundError when database has no runs", () => {
      expect(() => getLatestLighthouseRun(db)).toThrow(
        LighthouseRunNotFoundError,
      );
      expect(() => getLatestLighthouseRun(db)).toThrow(/No audit runs found/i);
    });
  });

  describe("listLighthouseRunsWithTotal & search filtering", () => {
    it("filters case-insensitively by search substring and returns matching total independent of pagination", () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "s1",
          url: "https://Docs.Example.com/guide",
          formFactor: "mobile",
          createdAt: new Date("2026-11-10T10:00:00Z"),
        }),
      );
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "s2",
          url: "https://example.com/100%_test",
          formFactor: "mobile",
          createdAt: new Date("2026-11-10T11:00:00Z"),
        }),
      );
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "s3",
          url: "https://unrelated.dev/home",
          formFactor: "mobile",
          createdAt: new Date("2026-11-10T12:00:00Z"),
        }),
      );

      const searchResult = listLighthouseRunsWithTotal(db, {
        search: "example.com",
        limit: 1,
        offset: 0,
      });
      expect(searchResult.total).toBe(2);
      expect(searchResult.runs.map((r) => r.id)).toEqual(["s2"]);

      const wildcardSearch = listLighthouseRunsWithTotal(db, {
        search: "100%_test",
      });
      expect(wildcardSearch.total).toBe(1);
      expect(wildcardSearch.runs.map((r) => r.id)).toEqual(["s2"]);

      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "s4-slash",
          url: "https://example.com/a/anything",
          formFactor: "mobile",
          createdAt: new Date("2026-11-10T13:00:00Z"),
        }),
      );
      expect(listLighthouseRunsWithTotal(db, { search: "a/%" }).total).toBe(0);
      expect(
        listLighthouseRunsWithTotal(db, { search: "a/any" }).runs.map(
          (r) => r.id,
        ),
      ).toEqual(["s4-slash"]);
      expect(countLighthouseRuns(db)).toBe(4);
    });
  });
});
