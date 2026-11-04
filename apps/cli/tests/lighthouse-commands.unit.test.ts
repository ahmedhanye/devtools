import * as cp from "node:child_process";
import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  createDb,
  runMigrations,
  type DevtoolsDb,
  type LighthouseRunRow,
  type NewLighthouseRunRow,
} from "@devtools/db";
import {
  insertLighthouseRun,
  type NormalizedLighthouseRun,
} from "@devtools/lighthouse";
import { createProgram } from "../src/cli";
import { runLighthouseAuditCommand } from "../src/lighthouse/audit";
import { runLighthouseDiffCommand } from "../src/lighthouse/diff";
import { runLighthouseListCommand } from "../src/lighthouse/list";
import {
  defaultIsHeadless,
  defaultSpawnOpener,
  runLighthouseOpenCommand,
} from "../src/lighthouse/open";
import { LighthouseOpenerError } from "../src/lighthouse/errors";

function makeSampleRow(
  overrides: Partial<NewLighthouseRunRow> = {},
): NewLighthouseRunRow {
  return {
    id: overrides.id ?? "11111111-2222-3333-4444-555555555555",
    url: overrides.url ?? "https://example.com/",
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

const mockNormalizedRun: NormalizedLighthouseRun = {
  requestedUrl: "https://example.com/",
  finalUrl: "https://example.com/",
  scores: {
    performanceScore: 85,
    accessibilityScore: 90,
    bestPracticesScore: 90,
    seoScore: 90,
  },
  metrics: {
    lcpMs: 2000,
    cls: 0.05,
    tbtMs: 150,
    fcpMs: 1000,
    siMs: 1800,
    ttfbMs: 100,
  },
  summary: {
    lcpElement: null,
    lcpPhases: null,
    clsCulprits: [],
    insights: [],
    failedAudits: [],
    runWarnings: [],
    runtimeError: null,
    medianMetadata: null,
  },
};

describe("CLI Lighthouse Command Surface (Unit)", () => {
  let db: DevtoolsDb;

  beforeEach(() => {
    db = createDb({ path: ":memory:" });
    runMigrations(db);
  });

  describe("Commander Tree Registration", () => {
    test("createProgram registers lighthouse command and subcommands", () => {
      const program = createProgram();
      const lhCmd = program.commands.find((cmd) => cmd.name() === "lighthouse");
      expect(lhCmd).toBeDefined();

      const subcommands = lhCmd?.commands.map((cmd) => cmd.name());
      expect(subcommands).toContain("list");
      expect(subcommands).toContain("diff");
      expect(subcommands).toContain("open");

      const optNames = lhCmd?.options.map((opt) => opt.name());
      expect(optNames).toContain("agent");
      expect(optNames).toContain("json");
      expect(optNames).toContain("fail-under");
      expect(optNames).toContain("runs");
      expect(optNames).toContain("form-factor");
      expect(optNames).toContain("throttling-method");
      expect(optNames).toContain("chrome-path");
      expect(optNames).toContain("no-sandbox");
      expect(optNames).toContain("artifacts-dir");
      expect(optNames).toContain("categories");
    });
  });

  describe("runLighthouseAuditCommand", () => {
    test("executes audit in terminal mode and outputs summary to stdout", async () => {
      const stdout: string[] = [];
      const stderr: string[] = [];

      await runLighthouseAuditCommand(
        "https://example.com/",
        {},
        {
          runLighthouseAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRow,
            representativeRunIndex: 0,
          }),
          getDb: () => db,
          findPreviousLighthouseRun: () => null,
          log: (msg) => stdout.push(msg),
          writeStderr: (msg) => stderr.push(msg),
        },
      );

      const out = stdout.join("\n");
      expect(out).toContain("Lighthouse Audit Report:");
      expect(out).toContain("https://example.com/");
    });

    test("executes audit in --agent mode with zero ANSI output", async () => {
      const stdout: string[] = [];

      await runLighthouseAuditCommand(
        "https://example.com/",
        { agent: true },
        {
          runLighthouseAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRow,
            representativeRunIndex: 0,
          }),
          getDb: () => db,
          log: (msg) => stdout.push(msg),
        },
      );

      const out = stdout.join("\n");
      // oxlint-disable-next-line no-control-regex
      expect(/\u001b\[/.test(out)).toBe(false);
      expect(out).toContain("# Lighthouse Audit: https://example.com/");
      expect(out).toContain("## Core Web Vitals");
    });

    test("executes audit in --json mode", async () => {
      const stdout: string[] = [];

      await runLighthouseAuditCommand(
        "https://example.com/",
        { json: true },
        {
          runLighthouseAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRow,
            representativeRunIndex: 0,
          }),
          getDb: () => db,
          log: (msg) => stdout.push(msg),
        },
      );

      const out = stdout.join("\n");
      const parsed = JSON.parse(out);
      expect(parsed.scores.performanceScore).toBe(85);
    });

    test("evaluates --fail-under and exits with 0 on pass", async () => {
      let exitCode: number | undefined;

      await runLighthouseAuditCommand(
        "https://example.com/",
        { failUnder: "perf:80" },
        {
          runLighthouseAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRow,
            representativeRunIndex: 0,
          }),
          getDb: () => db,
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(0);
    });

    test("evaluates --fail-under and exits with 1 on regression", async () => {
      let exitCode: number | undefined;

      await runLighthouseAuditCommand(
        "https://example.com/",
        { failUnder: "perf:95" },
        {
          runLighthouseAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRow,
            representativeRunIndex: 0,
          }),
          getDb: () => db,
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
    });

    test("catches execution error and exits with 1", async () => {
      let exitCode: number | undefined;
      const stderr: string[] = [];

      await runLighthouseAuditCommand(
        "https://example.com/",
        {},
        {
          runLighthouseAudit: async () => {
            throw new Error("Chromium launch failed");
          },
          getDb: () => db,
          writeStderr: (msg) => stderr.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(stderr.join("\n")).toContain("Chromium launch failed");
    });

    test("relays progress events to writeStderr and parses categories", async () => {
      const stderr: string[] = [];
      let capturedCategories: readonly string[] | undefined;

      await runLighthouseAuditCommand(
        "https://example.com/",
        { categories: "performance,seo" },
        {
          runLighthouseAudit: async (opts) => {
            capturedCategories = opts.categories;
            opts.onProgress?.({
              stage: "navigating",
              message: "Navigating to URL",
              runIndex: 0,
              totalRuns: 2,
            });
            return {
              normalized: mockNormalizedRun,
              run: makeSampleRow() as LighthouseRunRow,
              representativeRunIndex: 0,
            };
          },
          getDb: () => db,
          writeStderr: (msg) => stderr.push(msg),
          findPreviousLighthouseRun: () => {
            throw new Error("DB read error");
          },
        },
      );

      expect(capturedCategories).toEqual(["performance", "seo"]);
      expect(stderr.join("\n")).toContain(
        "[lighthouse] [navigating] Navigating to URL (run 1/2)",
      );
    });

    test("appends budget evaluation to agent mode output", async () => {
      const stdout: string[] = [];
      let exitCode: number | undefined;

      await runLighthouseAuditCommand(
        "https://example.com/",
        { agent: true, failUnder: "perf:80" },
        {
          runLighthouseAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRow,
            representativeRunIndex: 0,
          }),
          getDb: () => db,
          log: (msg) => stdout.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(0);
      const out = stdout.join("\n");
      expect(out).toContain("## Performance Budget");
      expect(out).toContain("| Metric | Target | Actual | Status |");
      // oxlint-disable-next-line no-control-regex
      expect(/\u001b\[/.test(out)).toBe(false);
    });

    test("exits 1 on invalid budget rule syntax", async () => {
      let exitCode: number | undefined;
      const stderr: string[] = [];

      await runLighthouseAuditCommand(
        "https://example.com/",
        { failUnder: "invalid_rule" },
        {
          runLighthouseAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRow,
            representativeRunIndex: 0,
          }),
          getDb: () => db,
          writeStderr: (msg) => stderr.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(stderr.join("\n")).toContain("Error parsing budget rules");
    });
  });

  describe("runLighthouseListCommand", () => {
    test("lists historical runs in terminal mode", async () => {
      insertLighthouseRun(db, makeSampleRow({ id: "run-aaa-111" }));
      const stdout: string[] = [];

      await runLighthouseListCommand(
        {},
        {
          getDb: () => db,
          log: (msg) => stdout.push(msg),
        },
      );

      const out = stdout.join("\n");
      expect(out).toContain("run-aaa-");
      expect(out).toContain("https://example.com/");
    });

    test("lists historical runs in --json mode", async () => {
      insertLighthouseRun(db, makeSampleRow({ id: "run-bbb-222" }));
      const stdout: string[] = [];

      await runLighthouseListCommand(
        { json: true },
        {
          getDb: () => db,
          log: (msg) => stdout.push(msg),
        },
      );

      const parsed = JSON.parse(stdout.join("\n"));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].id).toBe("run-bbb-222");
    });

    test("exits with 1 when database connection throws in list command", async () => {
      let exitCode: number | undefined;
      const origError = console.error;
      console.error = () => {};

      try {
        await runLighthouseListCommand(
          {},
          {
            getDb: () => {
              throw new Error("DB connection failure");
            },
            exit: (code) => {
              exitCode = code;
            },
          },
        );
        expect(exitCode).toBe(1);
      } finally {
        console.error = origError;
      }
    });

    test("exits with 1 when listRuns throws in list command", async () => {
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseListCommand(
        {},
        {
          getDb: () => db,
          listRuns: () => {
            throw new Error("Query execution error");
          },
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain(
        "Error retrieving audit runs: Query execution error",
      );
    });
  });

  describe("runLighthouseDiffCommand", () => {
    test("compares two runs and prints diff table", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({ id: "111111-aaa", performanceScore: 70 }),
      );
      insertLighthouseRun(
        db,
        makeSampleRow({ id: "222222-bbb", performanceScore: 85 }),
      );
      const stdout: string[] = [];

      await runLighthouseDiffCommand(
        "111111",
        "222222",
        {},
        {
          getDb: () => db,
          log: (msg) => stdout.push(msg),
        },
      );

      const out = stdout.join("\n");
      expect(out).toContain("111111");
      expect(out).toContain("222222");
      expect(out).toContain("+15");
    });

    test("compares two runs in --json mode", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({ id: "111111-aaa", performanceScore: 70 }),
      );
      insertLighthouseRun(
        db,
        makeSampleRow({ id: "222222-bbb", performanceScore: 85 }),
      );
      const stdout: string[] = [];

      await runLighthouseDiffCommand(
        "111111",
        "222222",
        { json: true },
        {
          getDb: () => db,
          log: (msg) => stdout.push(msg),
        },
      );

      const parsed = JSON.parse(stdout.join("\n"));
      expect(parsed.baseline.id).toBe("111111-aaa");
      expect(parsed.comparison.id).toBe("222222-bbb");
      expect(parsed.deltas.scores.performanceScore).toBe(15);
    });

    test("compares runs with insight audits and culprit deltas in terminal mode", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "333333-aaa",
          summaryJson: {
            lcpElement: null,
            lcpPhases: null,
            clsCulprits: [
              {
                element: {
                  selector: "#ad-banner",
                  snippet: null,
                  nodeLabel: null,
                  path: null,
                  lhId: null,
                  boundingRect: null,
                },
                score: 0.15,
                causes: [],
              },
            ],
            insights: [
              {
                id: "font-display",
                title: "Ensure text remains visible during webfont load",
                description: "Leverage font-display",
                score: 0.5,
                scoreDisplayMode: "numeric",
                displayValue: null,
                metricSavings: {},
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
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "444444-bbb",
          summaryJson: {
            lcpElement: null,
            lcpPhases: null,
            clsCulprits: [],
            insights: [
              {
                id: "render-blocking-resources",
                title: "Eliminate render-blocking resources",
                description: "Resources are blocking the first paint",
                score: 0.4,
                scoreDisplayMode: "numeric",
                displayValue: null,
                metricSavings: {},
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
      const stdout: string[] = [];

      await runLighthouseDiffCommand(
        "333333",
        "444444",
        {},
        {
          getDb: () => db,
          log: (msg) => stdout.push(msg),
        },
      );

      const out = stdout.join("\n");
      expect(out).toContain("Insight Audits & Culprits:");
      expect(out).toContain(
        "Resolved: Ensure text remains visible during webfont load",
      );
      expect(out).toContain("Regressed: Eliminate render-blocking resources");
      expect(out).toContain("CLS Culprits Delta: -1");
    });

    test("compares runs with insight audits in --json mode", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "555555-aaa",
          summaryJson: {
            lcpElement: null,
            lcpPhases: null,
            clsCulprits: [],
            insights: [
              {
                id: "modern-image-formats",
                title: "Serve images in next-gen formats",
                description: "AVIF and WebP provide better compression",
                score: 0.2,
                scoreDisplayMode: "numeric",
                displayValue: null,
                metricSavings: {},
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
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "666666-bbb",
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
        }),
      );
      const stdout: string[] = [];

      await runLighthouseDiffCommand(
        "555555",
        "666666",
        { json: true },
        {
          getDb: () => db,
          log: (msg) => stdout.push(msg),
        },
      );

      const parsed = JSON.parse(stdout.join("\n"));
      expect(parsed.deltas.insights.resolved[0].id).toBe(
        "modern-image-formats",
      );
      expect(parsed.deltas.insights.regressed.length).toBe(0);
      expect(parsed.deltas.insights.clsCulpritDelta).toBe(0);
    });

    test("handles malformed summaryJson gracefully in diff command", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "777777-aaa",
          summaryJson:
            "invalid-json" as unknown as typeof makeSampleRow extends (
              ...args: unknown[]
            ) => { summaryJson: infer T }
              ? T
              : never,
        }),
      );
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "888888-bbb",
          summaryJson:
            "invalid-json" as unknown as typeof makeSampleRow extends (
              ...args: unknown[]
            ) => { summaryJson: infer T }
              ? T
              : never,
        }),
      );
      const stdout: string[] = [];

      await runLighthouseDiffCommand(
        "777777",
        "888888",
        { json: true },
        {
          getDb: () => db,
          log: (msg) => stdout.push(msg),
        },
      );

      const parsed = JSON.parse(stdout.join("\n"));
      expect(parsed.deltas.insights.resolved).toEqual([]);
      expect(parsed.deltas.insights.regressed).toEqual([]);
    });

    test("exits with 1 when diff ID cannot be resolved", async () => {
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseDiffCommand(
        "invalid1",
        "invalid2",
        {},
        {
          getDb: () => db,
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("not found");
    });

    test("exits with 1 when database connection throws in diff command", async () => {
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseDiffCommand(
        "id1",
        "id2",
        {},
        {
          getDb: () => {
            throw new Error("DB connection failure");
          },
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("Error connecting to database");
    });
  });

  describe("runLighthouseOpenCommand", () => {
    test("prints file URI and exits 0 when running in headless environment", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "333333-ccc",
          htmlReportPath: "/tmp/fake-report.html",
        }),
      );
      const stdout: string[] = [];
      let openedPath: string | undefined;
      let exitCode: number | undefined;

      await runLighthouseOpenCommand(
        "333333",
        {},
        {
          getDb: () => db,
          fileExists: () => true,
          isHeadless: () => true,
          spawnOpener: (p) => {
            openedPath = p;
          },
          log: (msg) => stdout.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(openedPath).toBeUndefined();
      expect(stdout.join("\n")).toContain("file:///tmp/fake-report.html");
      expect(exitCode).toBe(0);
    });

    test("forwards options.env to isHeadless seam", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "open-env-111",
          htmlReportPath: "/tmp/report.html",
        }),
      );
      let capturedEnv:
        NodeJS.ProcessEnv | Record<string, string | undefined> | undefined;
      const stdout: string[] = [];

      await runLighthouseOpenCommand(
        "open-env-111",
        { env: { CI: "true" } },
        {
          getDb: () => db,
          fileExists: () => true,
          isHeadless: (env) => {
            capturedEnv = env;
            return true;
          },
          log: (msg) => stdout.push(msg),
          exit: () => {},
        },
      );

      expect(capturedEnv).toEqual({ CI: "true" });
      expect(stdout.join("\n")).toContain("file:///tmp/report.html");
    });

    test("invokes opener when not in headless environment", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "444444-ddd",
          htmlReportPath: "/tmp/fake-report.html",
        }),
      );
      let openedPath: string | undefined;

      await runLighthouseOpenCommand(
        "444444",
        {},
        {
          getDb: () => db,
          fileExists: () => true,
          isHeadless: () => false,
          spawnOpener: (p) => {
            openedPath = p;
          },
        },
      );

      expect(openedPath).toBe("/tmp/fake-report.html");
    });

    test("resolves latest run when id is omitted", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "555555-eee",
          htmlReportPath: "/tmp/latest-report.html",
        }),
      );
      let openedPath: string | undefined;

      await runLighthouseOpenCommand(
        undefined,
        {},
        {
          getDb: () => db,
          fileExists: () => true,
          isHeadless: () => false,
          spawnOpener: (p) => {
            openedPath = p;
          },
        },
      );

      expect(openedPath).toBe("/tmp/latest-report.html");
    });

    test("exits with 1 when HTML report artifact is missing on disk", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "666666-fff",
          htmlReportPath: "/tmp/missing-report.html",
        }),
      );
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseOpenCommand(
        "666666",
        {},
        {
          getDb: () => db,
          fileExists: () => false,
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("Report artifact file not found");
    });

    test("exits with 1 when database connection throws in open command", async () => {
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseOpenCommand(
        "id1",
        {},
        {
          getDb: () => {
            throw new Error("DB connection failure");
          },
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("Error connecting to database");
    });

    test("exits with 1 when spawnOpener throws in open command", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "777777-ggg",
          htmlReportPath: "/tmp/report.html",
        }),
      );
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseOpenCommand(
        "777777",
        {},
        {
          getDb: () => db,
          fileExists: () => true,
          isHeadless: () => false,
          spawnOpener: () => {
            throw new Error("Opener spawn failed");
          },
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("Failed to launch browser viewer");
    });

    test("LighthouseOpenerError initializes with code and default exitCode", () => {
      const err = new LighthouseOpenerError("Viewer error");
      expect(err.name).toBe("LighthouseOpenerError");
      expect(err.code).toBe("LIGHTHOUSE_OPENER_ERROR");
      expect(err.exitCode).toBe(1);
    });

    test("defaultIsHeadless detects headless environments correctly", () => {
      expect(defaultIsHeadless({ CI: "true" }, "linux")).toBe(true);
      expect(
        defaultIsHeadless({ CONTINUOUS_INTEGRATION: "true" }, "linux"),
      ).toBe(true);
      expect(defaultIsHeadless({}, "linux")).toBe(true);
      expect(defaultIsHeadless({ DISPLAY: ":0" }, "linux")).toBe(false);
      expect(defaultIsHeadless({ WAYLAND_DISPLAY: "wayland-0" }, "linux")).toBe(
        false,
      );
      expect(defaultIsHeadless({}, "darwin")).toBe(false);
      expect(defaultIsHeadless({}, "win32")).toBe(false);

      // Verify default arguments without explicitly passing parameters
      const origCi = process.env.CI;
      try {
        process.env.CI = "true";
        expect(defaultIsHeadless()).toBe(true);
      } finally {
        if (origCi !== undefined) process.env.CI = origCi;
        else delete process.env.CI;
      }
    });

    test("defaultSpawnOpener spawns appropriate command per platform", async () => {
      const spawned: Array<{ cmd: string; args: string[] }> = [];
      const spawnSpy = spyOn(cp, "spawn").mockImplementation(((
        cmd: string,
        args?: readonly string[],
      ) => {
        spawned.push({ cmd, args: args ? [...args] : [] });
        return { unref: () => {} };
      }) as never);

      try {
        await defaultSpawnOpener("/path/to/report.html", "darwin");
        expect(spawned[0]).toEqual({
          cmd: "open",
          args: ["/path/to/report.html"],
        });

        await defaultSpawnOpener("/path/to/report.html", "win32");
        expect(spawned[1]).toEqual({
          cmd: "cmd.exe",
          args: ["/c", "start", "", "/path/to/report.html"],
        });

        await defaultSpawnOpener("/path/to/report.html", "linux");
        expect(spawned[2]).toEqual({
          cmd: "xdg-open",
          args: ["/path/to/report.html"],
        });

        // Verify default platform argument executes
        await defaultSpawnOpener("/path/to/report.html");
        expect(spawned.length).toBe(4);
      } finally {
        spawnSpy.mockRestore();
      }
    });

    test("runLighthouseOpenCommand exits 1 on unknown run ID", async () => {
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseOpenCommand(
        "non-existent-id",
        {},
        {
          getDb: () => db,
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("not found");
    });

    test("runLighthouseOpenCommand falls back to process.exit when deps.exit is undefined", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(
        (() => {}) as never,
      );
      try {
        await runLighthouseOpenCommand(
          "non-existent-id",
          {},
          {
            getDb: () => db,
            error: () => {},
          },
        );
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
      }
    });

    test("runLighthouseOpenCommand executes defaultIsHeadless when isHeadless is omitted", async () => {
      insertLighthouseRun(
        db,
        makeSampleRow({
          id: "888888-hhh",
          htmlReportPath: "/tmp/report.html",
        }),
      );
      let exitCode: number | undefined;
      const stdout: string[] = [];

      const origCi = process.env.CI;
      process.env.CI = "true";

      try {
        await runLighthouseOpenCommand(
          "888888",
          {},
          {
            getDb: () => db,
            fileExists: () => true,
            log: (msg) => stdout.push(msg),
            exit: (code) => {
              exitCode = code;
            },
          },
        );

        expect(exitCode).toBe(0);
        expect(stdout.join("\n")).toContain("file:///tmp/report.html");
      } finally {
        if (origCi !== undefined) process.env.CI = origCi;
        else delete process.env.CI;
      }
    });

    test("fallback process.exit across audit, diff, and list commands", async () => {
      const exitSpy = spyOn(process, "exit").mockImplementation(
        (() => {}) as never,
      );
      const origError = console.error;
      console.error = () => {};

      try {
        await runLighthouseAuditCommand(
          "https://example.com/",
          {},
          {
            runLighthouseAudit: async () => {
              throw new Error("Audit error");
            },
            getDb: () => db,
            writeStderr: () => {},
          },
        );
        expect(exitSpy).toHaveBeenCalledWith(1);

        await runLighthouseListCommand(
          {},
          {
            getDb: () => {
              throw new Error("List DB error");
            },
          },
        );
        expect(exitSpy).toHaveBeenCalledWith(1);

        await runLighthouseDiffCommand(
          "id1",
          "id2",
          {},
          {
            getDb: () => {
              throw new Error("Diff DB error");
            },
            error: () => {},
          },
        );
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        console.error = origError;
        exitSpy.mockRestore();
      }
    });
  });
});
