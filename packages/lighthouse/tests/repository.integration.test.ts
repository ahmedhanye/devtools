import { beforeEach, describe, expect, it } from "bun:test";
import {
  createDb,
  runMigrations,
  type DevtoolsDb,
  type NewLighthouseRunRow,
} from "@devtools/db";
import { AmbiguousRunIdError, LighthouseRunNotFoundError } from "../src/errors";
import {
  findPreviousLighthouseRun,
  getLatestLighthouseRun,
  getLighthouseRunById,
  insertLighthouseRun,
  listLighthouseRuns,
  MIN_PREFIX_LENGTH,
  resolveLighthouseRun,
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

      // "test%" prefix should only match IDs starting with literal "test%"
      const matchPercent = resolveLighthouseRun(db, "test%spe");
      expect(matchPercent.id).toBe("test%special-id");

      // "test_" prefix should only match IDs starting with literal "test_"
      const matchUnderscore = resolveLighthouseRun(db, "test_und");
      expect(matchUnderscore.id).toBe("test_underscore-id");

      // Searching for "test%0" or "test_0" shouldn't match "test-run-001"
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
});
