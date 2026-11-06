import { beforeEach, describe, expect, test } from "bun:test";
import {
  createDb,
  runMigrations,
  type DevtoolsDb,
  type NewLighthouseRunRow,
} from "@devtools/db";
import { insertLighthouseRun } from "@devtools/lighthouse";
import {
  AmbiguousRunIdError,
  LighthouseRunNotFoundError,
} from "../src/lighthouse/errors";
import { resolveLatestRun, resolveRunId } from "../src/lighthouse/resolvers";

function makeSampleRow(
  overrides: Partial<NewLighthouseRunRow> = {},
): NewLighthouseRunRow {
  return {
    id: overrides.id ?? "11111111-2222-3333-4444-555555555555",
    url: overrides.url ?? "https://example.com",
    finalUrl: overrides.finalUrl ?? "https://example.com/",
    formFactor: overrides.formFactor ?? "mobile",
    throttlingMethod: overrides.throttlingMethod ?? "simulate",
    performanceScore: overrides.performanceScore ?? 90,
    accessibilityScore: overrides.accessibilityScore ?? 95,
    bestPracticesScore: overrides.bestPracticesScore ?? 90,
    seoScore: overrides.seoScore ?? 90,
    lcpMs: overrides.lcpMs ?? 1500,
    cls: overrides.cls ?? 0.01,
    tbtMs: overrides.tbtMs ?? 100,
    fcpMs: overrides.fcpMs ?? 800,
    siMs: overrides.siMs ?? 1200,
    ttfbMs: overrides.ttfbMs ?? 150,
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
    jsonReportPath: overrides.jsonReportPath ?? "/tmp/artifacts/report.json",
    htmlReportPath: overrides.htmlReportPath ?? "/tmp/artifacts/report.html",
    durationMs: overrides.durationMs ?? 3000,
    createdAt: overrides.createdAt ?? new Date(),
  };
}

describe("Lighthouse Resolvers (Unit)", () => {
  let db: DevtoolsDb;

  beforeEach(() => {
    db = createDb({ path: ":memory:" });
    runMigrations(db);
  });

  describe("resolveRunId", () => {
    test("resolves an exact full UUID", () => {
      const row = insertLighthouseRun(
        db,
        makeSampleRow({ id: "3f74b419-f027-4c07-b359-5f2105e46342" }),
      );
      const resolved = resolveRunId(db, "3f74b419-f027-4c07-b359-5f2105e46342");
      expect(resolved.id).toBe(row.id);
    });

    test("resolves a unique short ID prefix (>= 6 characters)", () => {
      const row = insertLighthouseRun(
        db,
        makeSampleRow({ id: "abcdef12-3456-7890-abcd-ef1234567890" }),
      );
      const resolved = resolveRunId(db, "abcdef");
      expect(resolved.id).toBe(row.id);
    });

    test("throws error when prefix is less than 6 characters unless exact match", () => {
      expect(() => resolveRunId(db, "abcde")).toThrow(
        LighthouseRunNotFoundError,
      );
    });

    test("throws descriptive error when run is not found", () => {
      expect(() =>
        resolveRunId(db, "99999999-9999-9999-9999-999999999999"),
      ).toThrow(LighthouseRunNotFoundError);
    });

    test("throws descriptive error when short ID prefix is ambiguous", () => {
      insertLighthouseRun(
        db,
        makeSampleRow({ id: "abcdef11-0000-0000-0000-000000000000" }),
      );
      insertLighthouseRun(
        db,
        makeSampleRow({ id: "abcdef22-0000-0000-0000-000000000000" }),
      );

      expect(() => resolveRunId(db, "abcdef")).toThrow(AmbiguousRunIdError);
    });
  });

  describe("resolveLatestRun", () => {
    test("resolves the most recent audit run", () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "run-first",
          createdAt: new Date("2026-11-04T10:00:00Z"),
        }),
      );
      const latest = insertLighthouseRun(
        db,
        makeSampleRow({
          id: "run-latest",
          createdAt: new Date("2026-11-04T12:00:00Z"),
        }),
      );

      const resolved = resolveLatestRun(db);
      expect(resolved.id).toBe(latest.id);
    });

    test("throws error when no audit runs exist in database", () => {
      expect(() => resolveLatestRun(db)).toThrow(LighthouseRunNotFoundError);
    });
  });
});
