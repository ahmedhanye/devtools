import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, sql, type DbHandle } from "@devtools/db";
import {
  AmbiguousRunIdError,
  LighthouseRunNotFoundError,
  createLighthouseStore,
  type LighthouseStore,
  type NewLighthouseRunRecord,
} from "../src";
import { MIN_PREFIX_LENGTH } from "../src/infra/persistence/sqlite-runs";

const DEFAULT_SAMPLE_ROW: NewLighthouseRunRecord = {
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
  overrides: Partial<NewLighthouseRunRecord> = {},
): NewLighthouseRunRecord {
  return { ...DEFAULT_SAMPLE_ROW, ...overrides };
}

describe("LighthouseStore Persistence (createLighthouseStore)", () => {
  let db: DbHandle;
  let store: LighthouseStore;
  let artifactsDir: string;

  beforeEach(() => {
    artifactsDir = mkdtempSync(join(tmpdir(), "devtools-lh-runs-"));
    db = openDb({ memory: true });
    store = createLighthouseStore({ db, artifactsDir });
  });

  afterEach(() => {
    db.close();
    rmSync(artifactsDir, { recursive: true, force: true });
  });

  it("exposes dbPath, resolveArtifactsDir without creating dirs, ensureReady, and never owns db lifecycle", () => {
    expect(store.dbPath).toBe(":memory:");
    expect(store.resolveArtifactsDir()).toBe(artifactsDir);
    store.ensureReady();

    const missingArtifacts = join(artifactsDir, "lazy-non-existent-artifacts");
    using callerDb = openDb({ memory: true });
    const wrappedStore = createLighthouseStore({
      db: callerDb,
      artifactsDir: missingArtifacts,
    });
    expect(wrappedStore.listRuns()).toEqual([]);
    wrappedStore.insertRun(makeSampleRow({ id: "caller-owned-1" }));
    expect(
      wrappedStore.resolveReportHtmlPath("caller-owned-1").safePath,
    ).toBeNull();
    // Read-only paths and target resolution never create missing directories on disk
    expect(wrappedStore.resolveArtifactsDir()).toBe(missingArtifacts);
    expect(existsSync(missingArtifacts)).toBe(false);
    expect("close" in wrappedStore).toBe(false);
    expect(callerDb.read(() => true)).toBe(true);
  });

  it("inserts a canonical LighthouseRunRecord and retrieves it by exact ID", () => {
    const inserted = store.insertRun(makeSampleRow({ id: "run-abc" }));
    expect(inserted.id).toBe("run-abc");
    expect(inserted.performanceScore).toBe(94);

    const found = store.getRun("run-abc");
    expect(found).toEqual(inserted);
    expect(() => store.getRun("non-existent")).toThrow(
      LighthouseRunNotFoundError,
    );
  });

  it("lists runs ordered by createdAt descending with url, formFactor, limit, and offset filters", () => {
    store.insertRun(
      makeSampleRow({
        id: "r1",
        url: "https://example.com",
        formFactor: "mobile",
        createdAt: new Date("2026-10-29T10:00:00Z"),
      }),
    );
    store.insertRun(
      makeSampleRow({
        id: "r2",
        url: "https://example.com",
        formFactor: "desktop",
        createdAt: new Date("2026-10-29T11:00:00Z"),
      }),
    );
    store.insertRun(
      makeSampleRow({
        id: "r3",
        url: "https://other.dev",
        formFactor: "mobile",
        createdAt: new Date("2026-10-29T12:00:00Z"),
      }),
    );

    const all = store.listRuns();
    expect(all.map((r) => r.id)).toEqual(["r3", "r2", "r1"]);

    const filteredByUrl = store.listRuns({
      url: "https://example.com",
    });
    expect(filteredByUrl.map((r) => r.id)).toEqual(["r2", "r1"]);

    const filteredByBoth = store.listRuns({
      url: "https://example.com",
      formFactor: "mobile",
    });
    expect(filteredByBoth.map((r) => r.id)).toEqual(["r1"]);

    const paginated = store.listRuns({ limit: 1, offset: 1 });
    expect(paginated.map((r) => r.id)).toEqual(["r2"]);
  });

  it("finds the most recent previous run for the same URL and formFactor excluding excludeId", () => {
    store.insertRun(
      makeSampleRow({
        id: "old-mobile",
        url: "https://example.com",
        formFactor: "mobile",
        createdAt: new Date("2026-10-29T10:00:00Z"),
      }),
    );
    store.insertRun(
      makeSampleRow({
        id: "prev-mobile",
        url: "https://example.com",
        formFactor: "mobile",
        createdAt: new Date("2026-10-29T11:00:00Z"),
      }),
    );
    store.insertRun(
      makeSampleRow({
        id: "curr-mobile",
        url: "https://example.com",
        formFactor: "mobile",
        createdAt: new Date("2026-10-29T12:00:00Z"),
      }),
    );

    const prevWithExclude = store.findPreviousRun({
      url: "https://example.com",
      formFactor: "mobile",
      excludeId: "curr-mobile",
    });
    expect(prevWithExclude?.id).toBe("prev-mobile");

    const latestWithoutExclude = store.findPreviousRun({
      url: "https://example.com",
      formFactor: "mobile",
    });
    expect(latestWithoutExclude?.id).toBe("curr-mobile");

    const noneForDesktop = store.findPreviousRun({
      url: "https://example.com",
      formFactor: "desktop",
    });
    expect(noneForDesktop).toBeNull();
  });

  describe("getRun (ID, prefix, latest, and error mapping)", () => {
    it("resolves exact match by full UUID or exact short ID", () => {
      const row = store.insertRun(
        makeSampleRow({ id: "3f74b419-f027-4c07-b359-5f2105e46342" }),
      );
      expect(store.getRun("3f74b419-f027-4c07-b359-5f2105e46342").id).toBe(
        row.id,
      );

      const shortRow = store.insertRun(makeSampleRow({ id: "short" }));
      expect(store.getRun("short").id).toBe(shortRow.id);
    });

    it("resolves a unique short ID prefix (>= 6 characters)", () => {
      const row = store.insertRun(
        makeSampleRow({ id: "abcdef12-3456-7890-abcd-ef1234567890" }),
      );
      expect(store.getRun("abcdef").id).toBe(row.id);
    });

    it("throws LighthouseRunNotFoundError when prefix is less than MIN_PREFIX_LENGTH and not exact", () => {
      store.insertRun(
        makeSampleRow({ id: "abcdef12-3456-7890-abcd-ef1234567890" }),
      );
      expect(() => store.getRun("abcde")).toThrow(LighthouseRunNotFoundError);
      expect(() => store.getRun("abcde")).toThrow(
        new RegExp(`Minimum ${MIN_PREFIX_LENGTH} characters required`),
      );
    });

    it("throws LighthouseRunNotFoundError when no matching record is found", () => {
      expect(() =>
        store.getRun("99999999-9999-9999-9999-999999999999"),
      ).toThrow(LighthouseRunNotFoundError);
      expect(() => store.getRun("999999")).toThrow(/not found/i);
    });

    it("throws AmbiguousRunIdError when short ID prefix matches multiple records", () => {
      store.insertRun(
        makeSampleRow({ id: "abcdef11-0000-0000-0000-000000000000" }),
      );
      store.insertRun(
        makeSampleRow({ id: "abcdef22-0000-0000-0000-000000000000" }),
      );

      expect(() => store.getRun("abcdef")).toThrow(AmbiguousRunIdError);
      expect(() => store.getRun("abcdef")).toThrow(/Matches multiple runs/);
    });

    it("escapes SQL wildcards (% and _) correctly during prefix lookup", () => {
      store.insertRun(makeSampleRow({ id: "test-run-001" }));
      store.insertRun(makeSampleRow({ id: "test%special-id" }));
      store.insertRun(makeSampleRow({ id: "test_underscore-id" }));

      expect(store.getRun("test%spe").id).toBe("test%special-id");
      expect(store.getRun("test_und").id).toBe("test_underscore-id");

      expect(() => store.getRun("test%001")).toThrow(
        LighthouseRunNotFoundError,
      );
      expect(() => store.getRun("test_run")).toThrow(
        LighthouseRunNotFoundError,
      );
    });

    it("resolves the most recent run when idOrPrefix is omitted and throws when empty", () => {
      expect(() => store.getRun()).toThrow(LighthouseRunNotFoundError);
      expect(() => store.getRun()).toThrow(/No audit runs found/i);

      store.insertRun(
        makeSampleRow({
          id: "run-first",
          createdAt: new Date("2026-11-04T10:00:00Z"),
        }),
      );
      store.insertRun(
        makeSampleRow({
          id: "run-second",
          createdAt: new Date("2026-11-04T12:00:00Z"),
        }),
      );
      store.insertRun(
        makeSampleRow({
          id: "run-third",
          createdAt: new Date("2026-11-04T11:00:00Z"),
        }),
      );

      expect(store.getRun().id).toBe("run-second");
    });
  });

  describe("diffRuns, resolveReportHtmlPath & listRunsWithTotal", () => {
    it("computes pairwise deltas and validates symlink-confined HTML report paths", () => {
      const runDir = join(artifactsDir, "diff-run-2");
      mkdirSync(runDir, { recursive: true });
      const htmlPath = join(runDir, "report.html");
      writeFileSync(htmlPath, "<html><body>Diff Run 2</body></html>");

      store.insertRun(
        makeSampleRow({
          id: "diff-run-1",
          performanceScore: 70,
          lcpMs: 2500,
          htmlReportPath: join(artifactsDir, "missing", "report.html"),
          createdAt: new Date("2026-11-10T10:00:00Z"),
        }),
      );
      store.insertRun(
        makeSampleRow({
          id: "diff-run-2",
          performanceScore: 95,
          lcpMs: 1200,
          htmlReportPath: htmlPath,
          createdAt: new Date("2026-11-10T11:00:00Z"),
        }),
      );

      const diff = store.diffRuns("diff-run-1", "diff-run-2");
      expect(diff.baseline.id).toBe("diff-run-1");
      expect(diff.comparison.id).toBe("diff-run-2");
      expect(diff.deltas.scores.performanceScore).toBe(25);
      expect(diff.deltas.metrics.lcpMs).toBe(-1300);

      const resolvedValid = store.resolveReportHtmlPath("diff-run-2");
      expect(resolvedValid.run.id).toBe("diff-run-2");
      expect(resolvedValid.safePath).toBe(htmlPath);

      const resolvedMissing = store.resolveReportHtmlPath("diff-run-1");
      expect(resolvedMissing.safePath).toBeNull();
    });

    it("filters case-insensitively by search substring and returns matching total independent of pagination", () => {
      store.insertRun(
        makeSampleRow({
          id: "s1",
          url: "https://Docs.Example.com/guide",
          formFactor: "mobile",
          createdAt: new Date("2026-11-10T10:00:00Z"),
        }),
      );
      store.insertRun(
        makeSampleRow({
          id: "s2",
          url: "https://example.com/100%_test",
          formFactor: "mobile",
          createdAt: new Date("2026-11-10T11:00:00Z"),
        }),
      );
      store.insertRun(
        makeSampleRow({
          id: "s3",
          url: "https://unrelated.dev/home",
          formFactor: "mobile",
          createdAt: new Date("2026-11-10T12:00:00Z"),
        }),
      );

      const searchResult = store.listRunsWithTotal({
        search: "example.com",
        limit: 1,
        offset: 0,
      });
      expect(searchResult.total).toBe(2);
      expect(searchResult.runs.map((r) => r.id)).toEqual(["s2"]);

      const wildcardSearch = store.listRunsWithTotal({
        search: "100%_test",
      });
      expect(wildcardSearch.total).toBe(1);
      expect(wildcardSearch.runs.map((r) => r.id)).toEqual(["s2"]);

      store.insertRun(
        makeSampleRow({
          id: "s4-slash",
          url: "https://example.com/a/anything",
          formFactor: "mobile",
          createdAt: new Date("2026-11-10T13:00:00Z"),
        }),
      );
      expect(store.listRunsWithTotal({ search: "a/%" }).total).toBe(0);
      expect(
        store.listRunsWithTotal({ search: "a/any" }).runs.map((r) => r.id),
      ).toEqual(["s4-slash"]);
      expect(store.listRunsWithTotal().total).toBe(4);
    });

    it("preserves null summaryJson for malformed rows and avoids false insight diffs in both directions", () => {
      const malformedSummary = {
        unexpected: true,
      } as unknown as NewLighthouseRunRecord["summaryJson"];

      const inserted = store.insertRun(
        makeSampleRow({
          id: "malformed-summary-1",
          summaryJson: malformedSummary,
        }),
      );
      store.insertRun(
        makeSampleRow({
          id: "malformed-summary-2",
          summaryJson:
            "bad-json" as unknown as NewLighthouseRunRecord["summaryJson"],
        }),
      );
      store.insertRun(
        makeSampleRow({
          id: "valid-with-findings",
          summaryJson: {
            lcpElement: null,
            lcpPhases: null,
            clsCulprits: [
              {
                element: {
                  selector: "header > div.banner",
                  snippet: '<div class="banner"></div>',
                  nodeLabel: "Banner",
                  path: null,
                  lhId: null,
                  boundingRect: {
                    top: 0,
                    bottom: 50,
                    left: 0,
                    right: 300,
                    width: 300,
                    height: 50,
                  },
                },
                score: 0.18,
                causes: [],
              },
            ],
            insights: [
              {
                id: "render-blocking-insight",
                title: "Render blocking requests",
                description: "Requests block initial render.",
                score: 0.25,
                scoreDisplayMode: "numeric",
                displayValue: "Est savings: 420 ms",
                metricSavings: { LCP: 420 },
                replacesAudits: [],
              },
            ],
            failedAudits: [],
            runWarnings: [],
            runtimeError: null,
            medianMetadata: null,
          },
        }),
      );

      expect(inserted.summaryJson).toBeNull();

      const fetched = store.getRun("malformed-summary-1");
      expect(fetched.summaryJson).toBeNull();

      const bothMalformed = store.diffRuns(
        "malformed-summary-1",
        "malformed-summary-2",
      );
      expect(bothMalformed.deltas.insights).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: null,
      });

      const validToMalformed = store.diffRuns(
        "valid-with-findings",
        "malformed-summary-1",
      );
      expect(validToMalformed.deltas.insights).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: null,
      });

      const malformedToValid = store.diffRuns(
        "malformed-summary-1",
        "valid-with-findings",
      );
      expect(malformedToValid.deltas.insights).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: null,
      });
    });

    it("tolerates raw syntactically corrupt summary_json in SQLite across listRuns, getRun, and diffRuns", () => {
      using callerDb = openDb({ memory: true });
      const wrappedStore = createLighthouseStore({
        db: callerDb,
        artifactsDir,
      });

      wrappedStore.insertRun(
        makeSampleRow({
          id: "valid-against-raw-corrupt",
          performanceScore: 78,
          lcpMs: 2400,
          summaryJson: {
            lcpElement: null,
            lcpPhases: null,
            clsCulprits: [
              {
                element: {
                  selector: "header > div.banner",
                  snippet: '<div class="banner"></div>',
                  nodeLabel: "Banner",
                  path: null,
                  lhId: null,
                  boundingRect: {
                    top: 0,
                    bottom: 50,
                    left: 0,
                    right: 300,
                    width: 300,
                    height: 50,
                  },
                },
                score: 0.18,
                causes: [],
              },
            ],
            insights: [
              {
                id: "render-blocking-insight",
                title: "Render blocking requests",
                description: "Requests block initial render.",
                score: 0.25,
                scoreDisplayMode: "numeric",
                displayValue: "Est savings: 420 ms",
                metricSavings: { LCP: 420 },
                replacesAudits: [],
              },
            ],
            failedAudits: [],
            runWarnings: [],
            runtimeError: null,
            medianMetadata: null,
          },
        }),
      );

      callerDb.write((tx) => {
        tx.run(sql`
          INSERT INTO lighthouse_runs (
            id, url, final_url, form_factor, throttling_method,
            performance_score, accessibility_score, best_practices_score, seo_score,
            lcp_ms, cls, tbt_ms, fcp_ms, si_ms, ttfb_ms,
            summary_json, json_report_path, html_report_path, duration_ms, created_at
          ) VALUES (
            'raw-corrupt-json-run', 'https://example.com', 'https://example.com/', 'mobile', 'simulate',
            83, 100, 92, 98,
            2100, 0.02, 45, 780, 1150, 95,
            '{not-valid-json', '/tmp/raw-corrupt/report.json', '/tmp/raw-corrupt/report.html', 4100, 1793304000000
          )
        `);
      });

      const listed = wrappedStore.listRuns();
      const corruptFromList = listed.find(
        (run) => run.id === "raw-corrupt-json-run",
      );
      expect(corruptFromList).toBeDefined();
      expect("summaryJson" in (corruptFromList ?? {})).toBe(false);

      const fetched = wrappedStore.getRun("raw-corrupt-json-run");
      expect(fetched.summaryJson).toBeNull();

      const validToCorrupt = wrappedStore.diffRuns(
        "valid-against-raw-corrupt",
        "raw-corrupt-json-run",
      );
      expect(validToCorrupt.comparison.summaryJson).toBeNull();
      expect(validToCorrupt.deltas.scores.performanceScore).toBe(5);
      expect(validToCorrupt.deltas.metrics.lcpMs).toBe(-300);
      expect(validToCorrupt.deltas.insights).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: null,
      });

      const corruptToValid = wrappedStore.diffRuns(
        "raw-corrupt-json-run",
        "valid-against-raw-corrupt",
      );
      expect(corruptToValid.baseline.summaryJson).toBeNull();
      expect(corruptToValid.deltas.insights).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: null,
      });
    });

    it("resolves IDs via indexed range scan including uppercase UUID prefixes, \\uffff upper bounds, and EXPLAIN QUERY PLAN check", () => {
      store.insertRun(
        makeSampleRow({ id: "abcdef11-0000-4000-8000-000000000001" }),
      );
      store.insertRun(makeSampleRow({ id: "01234\uffff999" }));
      store.insertRun(
        makeSampleRow({ id: "\uffff\uffff\uffff\uffff\uffff\uffff-tail" }),
      );

      expect(store.getRun("ABCDEF").id).toBe(
        "abcdef11-0000-4000-8000-000000000001",
      );
      expect(store.getRun("01234\uffff").id).toBe("01234\uffff999");
      expect(store.getRun("\uffff\uffff\uffff\uffff\uffff\uffff").id).toBe(
        "\uffff\uffff\uffff\uffff\uffff\uffff-tail",
      );

      const planRows = db.read((rawDb) =>
        rawDb.all<{ detail: string }>(
          sql`EXPLAIN QUERY PLAN SELECT id FROM lighthouse_runs WHERE id >= 'abcdef' AND id < 'abcdeg' ORDER BY id ASC LIMIT 6`,
        ),
      );
      const details = planRows.map((row) => row.detail).join(" | ");
      expect(details).toContain("SEARCH lighthouse_runs");
      expect(details).not.toContain("SCAN lighthouse_runs");
    });

    it("resolves supplementary Unicode IDs in SQLite UTF-8 byte order without surrogate corruption or \\uffff false matches", () => {
      store.insertRun(makeSampleRow({ id: "0123\uD800\uDFFF-run" }));
      store.insertRun(makeSampleRow({ id: "01234\uffff999" }));
      store.insertRun(makeSampleRow({ id: "01234🚀-tail" }));
      store.insertRun(
        makeSampleRow({ id: "\uffff\uffff\uffff\uffff\uffff\uffff-tail" }),
      );
      store.insertRun(makeSampleRow({ id: "🚀-rocket" }));
      store.insertRun(makeSampleRow({ id: "01234\ud7ff-gap" }));
      store.insertRun(makeSampleRow({ id: "01234\ue000-next" }));
      store.insertRun(makeSampleRow({ id: "abcde\u{10FFFF}-carry" }));
      store.insertRun(makeSampleRow({ id: "abcdf0-next" }));
      store.insertRun(
        makeSampleRow({
          id: "\u{10FFFF}\u{10FFFF}\u{10FFFF}\u{10FFFF}\u{10FFFF}\u{10FFFF}-max",
        }),
      );

      expect(store.getRun("0123\uD800\uDFFF").id).toBe("0123\uD800\uDFFF-run");
      expect(store.getRun("01234\uffff").id).toBe("01234\uffff999");
      expect(store.getRun("01234🚀").id).toBe("01234🚀-tail");
      expect(store.getRun("\uffff\uffff\uffff\uffff\uffff\uffff").id).toBe(
        "\uffff\uffff\uffff\uffff\uffff\uffff-tail",
      );
      expect(store.getRun("🚀-roc").id).toBe("🚀-rocket");
      expect(store.getRun("01234\ud7ff").id).toBe("01234\ud7ff-gap");
      expect(store.getRun("abcde\u{10FFFF}").id).toBe("abcde\u{10FFFF}-carry");
      expect(
        store.getRun(
          "\u{10FFFF}\u{10FFFF}\u{10FFFF}\u{10FFFF}\u{10FFFF}\u{10FFFF}",
        ).id,
      ).toBe(
        "\u{10FFFF}\u{10FFFF}\u{10FFFF}\u{10FFFF}\u{10FFFF}\u{10FFFF}-max",
      );
    });
  });
});
