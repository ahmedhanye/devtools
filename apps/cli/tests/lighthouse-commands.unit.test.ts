import * as cp from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createShutdownCoordinator, hostShutdown } from "@devtools/core/node";
import {
  openLighthouseStore,
  type LighthouseRunRecord,
  type LighthouseStore,
  type NewLighthouseRunRecord,
  type NormalizedLighthouseRun,
} from "@devtools/lighthouse";
import { createProgram } from "../src/app";
import { runLighthouseAuditCommand } from "../src/commands/lighthouse/audit";
import { createLighthouseCliContext } from "../src/commands/lighthouse/context";
import { runLighthouseDiffCommand } from "../src/commands/lighthouse/diff";
import { stripAnsi } from "../src/commands/lighthouse/formatters/agent";
import { runLighthouseListCommand } from "../src/commands/lighthouse/list";
import {
  defaultIsHeadless,
  defaultSpawnOpener,
  runLighthouseOpenCommand,
} from "../src/commands/lighthouse/open";
import { LighthouseOpenerError } from "../src/commands/lighthouse/errors";

const DEFAULT_SAMPLE_ROW: Omit<NewLighthouseRunRecord, "createdAt"> = {
  id: "11111111-2222-3333-4444-555555555555",
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  performanceScore: 90,
  accessibilityScore: 95,
  bestPracticesScore: 90,
  seoScore: 90,
  lcpMs: 1500,
  cls: 0.01,
  tbtMs: 100,
  fcpMs: 800,
  siMs: 1200,
  ttfbMs: 150,
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
  jsonReportPath: "/tmp/artifacts/report.json",
  htmlReportPath: "/tmp/artifacts/report.html",
  durationMs: 3000,
};

function makeSampleRow(
  overrides: Partial<NewLighthouseRunRecord> = {},
): NewLighthouseRunRecord {
  return {
    ...DEFAULT_SAMPLE_ROW,
    createdAt: new Date(),
    ...overrides,
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
  let store: LighthouseStore;

  beforeEach(() => {
    store = openLighthouseStore({ memory: true });
  });

  afterEach(() => {
    store.close();
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
          runAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRecord,
            previousRun: null,
            representativeRunIndex: 0,
          }),
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
          runAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRecord,
            previousRun: null,
            representativeRunIndex: 0,
          }),
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
          runAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRecord,
            previousRun: null,
            representativeRunIndex: 0,
          }),
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
          runAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRecord,
            previousRun: null,
            representativeRunIndex: 0,
          }),
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
          runAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRecord,
            previousRun: null,
            representativeRunIndex: 0,
          }),
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
          runAudit: async () => {
            throw new Error("Chromium launch failed");
          },
          writeStderr: (msg) => stderr.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(stderr.join("\n")).toContain("Chromium launch failed");
    });

    test("isolates stderr color formatting and respects options.env seam", async () => {
      const stderrInteractive: string[] = [];
      await runLighthouseAuditCommand(
        "https://example.com/",
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: true,
          writeStderr: (msg) => stderrInteractive.push(msg),
          exit: () => {},
          runAudit: async () => {
            throw new Error("Audit execution failed");
          },
        },
      );
      expect(stderrInteractive.join("\n").includes("\x1b[")).toBe(true);
      expect(stderrInteractive.join("\n")).toContain("Audit execution failed");

      const stderrRedirected: string[] = [];
      await runLighthouseAuditCommand(
        "https://example.com/",
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: false,
          writeStderr: (msg) => stderrRedirected.push(msg),
          exit: () => {},
          runAudit: async () => {
            throw new Error("Audit execution failed");
          },
        },
      );
      expect(stderrRedirected.join("\n").includes("\x1b[")).toBe(false);
      expect(stderrRedirected.join("\n")).toContain("Audit execution failed");

      const stderrNoColor: string[] = [];
      await runLighthouseAuditCommand(
        "https://example.com/",
        { env: { TERM: "xterm-256color", NO_COLOR: "1" } },
        {
          isStderrTTY: true,
          writeStderr: (msg) => stderrNoColor.push(msg),
          exit: () => {},
          runAudit: async () => {
            throw new Error("Audit execution failed");
          },
        },
      );
      expect(stderrNoColor.join("\n").includes("\x1b[")).toBe(false);
      expect(stderrNoColor.join("\n")).toContain("Audit execution failed");
    });

    test("relays progress events to writeStderr and parses categories", async () => {
      const stderr: string[] = [];
      let capturedCategories: readonly string[] | undefined;

      await runLighthouseAuditCommand(
        "https://example.com/",
        { categories: "performance,seo" },
        {
          runAudit: async (opts) => {
            capturedCategories = opts.categories;
            opts.onProgress?.({
              stage: "analyzing",
              message: "Single run",
              runIndex: 0,
              totalRuns: 1,
            });
            opts.onProgress?.({
              stage: "analyzing",
              message: "Missing index",
              totalRuns: 2,
            });
            opts.onProgress?.({
              stage: "navigating",
              message: "Navigating to URL",
              runIndex: 0,
              totalRuns: 2,
            });
            return {
              normalized: mockNormalizedRun,
              run: makeSampleRow() as LighthouseRunRecord,
              previousRun: null,
              representativeRunIndex: 0,
            };
          },
          writeStderr: (msg) => stderr.push(msg),
        },
      );

      expect(capturedCategories).toEqual(["performance", "seo"]);
      const combinedStderr = stderr.join("\n");
      expect(combinedStderr).toContain("[lighthouse] [analyzing] Single run\n");
      expect(combinedStderr).toContain(
        "[lighthouse] [analyzing] Missing index\n",
      );
      expect(combinedStderr).not.toContain("(run 1/1)");
      expect(combinedStderr).not.toContain("NaN");
      expect(combinedStderr).toContain(
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
          runAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRecord,
            previousRun: null,
            representativeRunIndex: 0,
          }),
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
          runAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow() as LighthouseRunRecord,
            previousRun: null,
            representativeRunIndex: 0,
          }),
          writeStderr: (msg) => stderr.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(stderr.join("\n")).toContain("Error parsing budget rules");
    });

    test("exits 1 on invalid budget rule syntax upfront without invoking audit execution", async () => {
      let exitCode: number | undefined;
      let auditCalled = false;
      const stderr: string[] = [];

      await runLighthouseAuditCommand(
        "https://example.com/",
        { failUnder: "invalid_rule" },
        {
          runAudit: async () => {
            auditCalled = true;
            return {
              normalized: mockNormalizedRun,
              run: makeSampleRow() as LighthouseRunRecord,
              previousRun: null,
              representativeRunIndex: 0,
            };
          },
          writeStderr: (msg) => stderr.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(auditCalled).toBe(false);
      expect(exitCode).toBe(1);
      expect(stderr.join("\n")).toContain("Error parsing budget rules");
    });

    test("renders baseline header when runAudit returns a previousRun", async () => {
      const stdout: string[] = [];

      await runLighthouseAuditCommand(
        "http://example.com",
        {},
        {
          runAudit: async () => ({
            normalized: mockNormalizedRun,
            run: makeSampleRow({
              url: "http://example.com/",
            }) as LighthouseRunRecord,
            previousRun: makeSampleRow({
              id: "prev-111-222",
              url: "http://example.com/",
            }) as LighthouseRunRecord,
            representativeRunIndex: 0,
          }),
          log: (msg) => stdout.push(msg),
        },
      );

      expect(stdout.join("\n")).toContain("Baseline: Run prev-111");
    });

    test("forwards explicit options.signal via store.runAudit and exits 1 when store connection fails", async () => {
      const controller = new AbortController();
      let capturedSignal: AbortSignal | undefined;
      const stdout: string[] = [];
      let exitCode: number | undefined;
      const stderr: string[] = [];

      await runLighthouseAuditCommand(
        "https://example.com/",
        { json: true },
        {
          openStore: () => {
            throw new Error("DB unreachable");
          },
          error: (msg) => stderr.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );
      expect(exitCode).toBe(1);
      expect(stderr.join("\n")).toContain("DB unreachable");

      await runLighthouseAuditCommand(
        "https://example.com/",
        { signal: controller.signal, json: true },
        {
          openStore: () => ({
            ...store,
            runAudit: async (opts) => {
              capturedSignal = opts.signal;
              return {
                normalized: mockNormalizedRun,
                run: makeSampleRow() as LighthouseRunRecord,
                previousRun: null,
                representativeRunIndex: 0,
              };
            },
          }),
          log: (msg) => stdout.push(msg),
        },
      );

      expect(capturedSignal).toBe(controller.signal);
      expect(JSON.parse(stdout.join("\n")).requestedUrl).toBe(
        "https://example.com/",
      );
    });

    test("defaults signal to hostShutdown and awaits Phase 2 work cleanup before exit on shutdown", async () => {
      const shutdown = createShutdownCoordinator();
      let capturedDefaultSignal: AbortSignal | undefined;
      await runLighthouseAuditCommand(
        "https://example.com/",
        { json: true },
        {
          runAudit: async (opts) => {
            capturedDefaultSignal = opts.signal;
            return {
              normalized: mockNormalizedRun,
              run: makeSampleRow() as LighthouseRunRecord,
              previousRun: null,
              representativeRunIndex: 0,
            };
          },
          log: () => {},
        },
      );
      expect(capturedDefaultSignal).toBe(hostShutdown.signal);

      let releaseCleanup!: () => void;
      const cleanupGate = new Promise<void>((res) => {
        releaseCleanup = res;
      });
      let notifyStarted!: () => void;
      const started = new Promise<void>((res) => {
        notifyStarted = res;
      });
      let cleanupFinished = false;
      const exitCalls: Array<number | undefined> = [];

      const commandPromise = runLighthouseAuditCommand(
        "https://example.com/",
        {},
        {
          shutdown,
          runAudit: async (opts) => {
            notifyStarted();
            expect(opts.signal).toBe(shutdown.signal);
            await cleanupGate;
            cleanupFinished = true;
            throw new Error("aborted during cleanup");
          },
          writeStderr: () => {},
          exit: (code) => {
            exitCalls.push(code);
          },
        },
      );

      await started;
      let shutdownResolved = false;
      const shutdownPromise = (async () => {
        await shutdown.shutdown("SIGTERM");
        shutdownResolved = true;
      })();

      await Bun.sleep(10);
      expect(shutdownResolved).toBe(false);
      expect(cleanupFinished).toBe(false);

      releaseCleanup();
      await Promise.all([shutdownPromise, commandPromise]);
      expect(shutdownResolved).toBe(true);
      expect(cleanupFinished).toBe(true);
      expect(exitCalls).toEqual([]);
    });

    test("forwards --no-sandbox, explicit disableSandbox precedence, and audit options to runAudit", async () => {
      const capturedOptions: Array<Record<string, unknown>> = [];
      const mockResult = {
        normalized: mockNormalizedRun,
        run: makeSampleRow() as LighthouseRunRecord,
        previousRun: null,
        representativeRunIndex: 0,
      };

      await runLighthouseAuditCommand(
        "https://example.com/",
        {
          sandbox: false,
          runs: 3,
          formFactor: "desktop",
          throttlingMethod: "provided",
          categories: "performance, seo",
          chromePath: "/mock/chromium",
          artifactsDir: "/tmp/lh-artifacts",
          env: { CUSTOM_ENV: "1" },
          json: true,
        },
        {
          runAudit: async (opts) => {
            capturedOptions.push({ ...opts });
            return mockResult;
          },
          log: () => {},
        },
      );

      expect(capturedOptions[0]?.disableSandbox).toBe(true);
      expect(capturedOptions[0]?.runs).toBe(3);
      expect(capturedOptions[0]?.formFactor).toBe("desktop");
      expect(capturedOptions[0]?.throttlingMethod).toBe("provided");
      expect(capturedOptions[0]?.categories).toEqual(["performance", "seo"]);
      expect(capturedOptions[0]?.chromePath).toBe("/mock/chromium");
      expect(capturedOptions[0]?.artifactsDir).toBe("/tmp/lh-artifacts");
      expect(capturedOptions[0]?.env).toEqual({ CUSTOM_ENV: "1" });

      await runLighthouseAuditCommand(
        "https://example.com/",
        {
          disableSandbox: false,
          sandbox: false,
          json: true,
        },
        {
          runAudit: async (opts) => {
            capturedOptions.push({ ...opts });
            return mockResult;
          },
          log: () => {},
        },
      );

      expect(capturedOptions[1]?.disableSandbox).toBe(false);
    });
  });

  describe("runLighthouseListCommand", () => {
    test("lists historical runs in terminal mode", async () => {
      store.insertRun(makeSampleRow({ id: "run-aaa-111" }));
      const stdout: string[] = [];

      await runLighthouseListCommand(
        {},
        {
          openStore: () => store,
          log: (msg) => stdout.push(msg),
        },
      );

      const out = stdout.join("\n");
      expect(out).toContain("run-aaa-");
      expect(out).toContain("https://example.com/");
    });

    test("lists historical runs in --json mode", async () => {
      store.insertRun(makeSampleRow({ id: "run-bbb-222" }));
      const stdout: string[] = [];

      await runLighthouseListCommand(
        { json: true },
        {
          openStore: () => store,
          log: (msg) => stdout.push(msg),
        },
      );

      const parsed = JSON.parse(stdout.join("\n"));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].id).toBe("run-bbb-222");
    });

    test("filters runs cleanly when valid formFactor mobile or desktop is passed", async () => {
      store.insertRun(makeSampleRow({ id: "run-mob-1", formFactor: "mobile" }));
      store.insertRun(
        makeSampleRow({ id: "run-desk-2", formFactor: "desktop" }),
      );
      const desktopOut: string[] = [];
      await runLighthouseListCommand(
        { formFactor: "desktop", json: true },
        {
          openStore: () => store,
          log: (msg) => desktopOut.push(msg),
        },
      );
      const desktopParsed = JSON.parse(desktopOut.join("\n"));
      expect(desktopParsed).toHaveLength(1);
      expect(desktopParsed[0].id).toBe("run-desk-2");

      const mobileOut: string[] = [];
      await runLighthouseListCommand(
        { formFactor: "mobile", json: true },
        {
          openStore: () => store,
          log: (msg) => mobileOut.push(msg),
        },
      );
      const mobileParsed = JSON.parse(mobileOut.join("\n"));
      expect(mobileParsed).toHaveLength(1);
      expect(mobileParsed[0].id).toBe("run-mob-1");
    });

    test("exits with 1 when database connection throws in list command", async () => {
      let exitCode: number | undefined;
      const origError = console.error;
      console.error = () => {};

      try {
        await runLighthouseListCommand(
          {},
          {
            openStore: () => {
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
          openStore: () => ({
            ...store,
            listRuns: () => {
              throw new Error("Query execution error");
            },
          }),
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

    test("exits with 1 when limit is negative or invalid in list command", async () => {
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseListCommand(
        { limit: -5 },
        {
          openStore: () => store,
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain(
        'Invalid limit "-5": must be a non-negative integer',
      );
    });

    test("exits with 1 when form-factor is invalid in list command", async () => {
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseListCommand(
        { formFactor: "tablet" as never },
        {
          openStore: () => store,
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain(
        'Invalid form-factor "tablet": must be "mobile" or "desktop"',
      );
    });

    test("isolates stderr color formatting and respects options.env seam", async () => {
      const errorsInteractive: string[] = [];
      await runLighthouseListCommand(
        { env: { TERM: "xterm-256color" }, limit: -1 },
        {
          isStderrTTY: true,
          openStore: () => store,
          error: (msg) => errorsInteractive.push(msg),
          exit: () => {},
        },
      );
      expect(errorsInteractive.join("\n").includes("\x1b[")).toBe(true);

      const errorsRedirected: string[] = [];
      await runLighthouseListCommand(
        { env: { TERM: "xterm-256color" }, limit: -1 },
        {
          isStderrTTY: false,
          openStore: () => store,
          error: (msg) => errorsRedirected.push(msg),
          exit: () => {},
        },
      );
      expect(errorsRedirected.join("\n").includes("\x1b[")).toBe(false);

      const errorsNoColor: string[] = [];
      await runLighthouseListCommand(
        { env: { TERM: "xterm-256color", NO_COLOR: "1" }, limit: -1 },
        {
          isStderrTTY: true,
          openStore: () => store,
          error: (msg) => errorsNoColor.push(msg),
          exit: () => {},
        },
      );
      expect(errorsNoColor.join("\n").includes("\x1b[")).toBe(false);
    });
  });

  describe("runLighthouseDiffCommand", () => {
    test("compares two runs and prints diff table", async () => {
      store.insertRun(
        makeSampleRow({ id: "111111-aaa", performanceScore: 70 }),
      );
      store.insertRun(
        makeSampleRow({ id: "222222-bbb", performanceScore: 85 }),
      );
      const stdout: string[] = [];

      await runLighthouseDiffCommand(
        "111111",
        "222222",
        {},
        {
          openStore: () => store,
          log: (msg) => stdout.push(msg),
        },
      );

      const out = stdout.join("\n");
      expect(out).toContain("111111");
      expect(out).toContain("222222");
      expect(out).toContain("+15");
    });

    test("compares two runs in --json mode", async () => {
      store.insertRun(
        makeSampleRow({ id: "111111-aaa", performanceScore: 70 }),
      );
      store.insertRun(
        makeSampleRow({ id: "222222-bbb", performanceScore: 85 }),
      );
      const stdout: string[] = [];

      await runLighthouseDiffCommand(
        "111111",
        "222222",
        { json: true },
        {
          openStore: () => store,
          log: (msg) => stdout.push(msg),
        },
      );

      const parsed = JSON.parse(stdout.join("\n"));
      expect(parsed.baseline.id).toBe("111111-aaa");
      expect(parsed.comparison.id).toBe("222222-bbb");
      expect(parsed.deltas.scores.performanceScore).toBe(15);
    });

    test("compares runs with insight audits and culprit deltas in terminal mode", async () => {
      store.insertRun(
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
      store.insertRun(
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
          openStore: () => store,
          log: (msg) => stdout.push(msg),
        },
      );

      const out = stripAnsi(stdout.join("\n"));
      expect(out).toContain("Insight Audits & Culprits:");
      expect(out).toContain(
        "Resolved: Ensure text remains visible during webfont load",
      );
      expect(out).toContain("Regressed: Eliminate render-blocking resources");
      expect(out).toContain("CLS Culprits Delta: -1");
    });

    test("compares runs with insight audits in --json mode", async () => {
      store.insertRun(
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
      store.insertRun(
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
          openStore: () => store,
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
      store.insertRun(
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
      store.insertRun(
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
          openStore: () => store,
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
          openStore: () => store,
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("not found");
    });

    test("isolates stderr color formatting and respects options.env seam", async () => {
      const errorsInteractive: string[] = [];
      await runLighthouseDiffCommand(
        "invalid1",
        "invalid2",
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: true,
          openStore: () => store,
          error: (msg) => errorsInteractive.push(msg),
          exit: () => {},
        },
      );
      expect(errorsInteractive.join("\n").includes("\x1b[")).toBe(true);

      const errorsRedirected: string[] = [];
      await runLighthouseDiffCommand(
        "invalid1",
        "invalid2",
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: false,
          openStore: () => store,
          error: (msg) => errorsRedirected.push(msg),
          exit: () => {},
        },
      );
      expect(errorsRedirected.join("\n").includes("\x1b[")).toBe(false);

      const errorsNoColor: string[] = [];
      await runLighthouseDiffCommand(
        "invalid1",
        "invalid2",
        { env: { TERM: "xterm-256color", NO_COLOR: "1" } },
        {
          isStderrTTY: true,
          openStore: () => store,
          error: (msg) => errorsNoColor.push(msg),
          exit: () => {},
        },
      );
      expect(errorsNoColor.join("\n").includes("\x1b[")).toBe(false);
    });

    test("exits with 1 when database connection throws in diff command", async () => {
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseDiffCommand(
        "id1",
        "id2",
        {},
        {
          openStore: () => {
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
      store.insertRun(
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
          openStore: () => store,
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
      store.insertRun(
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
          openStore: () => store,
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
      store.insertRun(
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
          openStore: () => store,
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
      store.insertRun(
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
          openStore: () => store,
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
      store.insertRun(
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
          openStore: () => store,
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
          openStore: () => {
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
      store.insertRun(
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
          openStore: () => store,
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
      expect(defaultIsHeadless()).toBe(
        defaultIsHeadless(process.env, process.platform),
      );
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

    test("defaultSpawnOpener rejects with LighthouseOpenerError when child process emits error event", async () => {
      const { EventEmitter } = await import("node:events");
      const fakeChild = new EventEmitter();
      (fakeChild as unknown as { unref: () => void }).unref = () => {};

      const spawnSpy = spyOn(cp, "spawn").mockReturnValue(fakeChild as never);
      try {
        const promise = defaultSpawnOpener("/path/to/report.html", "linux");
        fakeChild.emit("error", new Error("ENOENT: missing xdg-open"));
        await expect(promise).rejects.toThrow(LighthouseOpenerError);
        await expect(promise).rejects.toThrow("ENOENT: missing xdg-open");
      } finally {
        spawnSpy.mockRestore();
      }
    });

    test("defaultSpawnOpener resolves when child process emits spawn event", async () => {
      const { EventEmitter } = await import("node:events");
      let unrefCalled = false;
      const fakeChild = Object.assign(new EventEmitter(), {
        unref: () => {
          unrefCalled = true;
        },
      });

      const spawnSpy = spyOn(cp, "spawn").mockReturnValue(fakeChild as never);
      try {
        const promise = defaultSpawnOpener("/path/to/report.html", "linux");
        fakeChild.emit("spawn");
        await expect(promise).resolves.toBeUndefined();
        expect(unrefCalled).toBe(true);
      } finally {
        spawnSpy.mockRestore();
      }
    });

    test("defaultSpawnOpener rejects with LighthouseOpenerError when spawn throws synchronously", async () => {
      const spawnSpy = spyOn(cp, "spawn").mockImplementation(() => {
        throw new Error("sync spawn error");
      });
      try {
        await expect(
          defaultSpawnOpener("/path/to/report.html", "linux"),
        ).rejects.toThrow(LighthouseOpenerError);
      } finally {
        spawnSpy.mockRestore();
      }

      const spawnNonErrorSpy = spyOn(cp, "spawn").mockImplementation(() => {
        // oxlint-disable-next-line typescript/only-throw-error -- intentional non-Error throw test
        throw "string error thrown";
      });
      try {
        await expect(
          defaultSpawnOpener("/path/to/report.html", "linux"),
        ).rejects.toThrow("string error thrown");
      } finally {
        spawnNonErrorSpy.mockRestore();
      }
    });

    test("runLighthouseOpenCommand exits 1 on unknown run ID", async () => {
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseOpenCommand(
        "non-existent-id",
        {},
        {
          openStore: () => store,
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain("not found");
    });

    test("runLighthouseOpenCommand exits 1 on empty string run ID", async () => {
      let exitCode: number | undefined;
      const errors: string[] = [];

      await runLighthouseOpenCommand(
        "",
        {},
        {
          openStore: () => store,
          error: (msg) => errors.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(errors.join("\n")).toContain('Run ID prefix "" is too short');
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
            openStore: () => store,
            error: () => {},
          },
        );
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
      }
    });

    test("runLighthouseOpenCommand executes defaultIsHeadless with options.env when isHeadless is omitted", async () => {
      store.insertRun(
        makeSampleRow({
          id: "888888-hhh",
          htmlReportPath: "/tmp/report.html",
        }),
      );
      let exitCode: number | undefined;
      const stdout: string[] = [];

      await runLighthouseOpenCommand(
        "888888",
        { env: { CI: "true" } },
        {
          openStore: () => store,
          fileExists: () => true,
          log: (msg) => stdout.push(msg),
          exit: (code) => {
            exitCode = code;
          },
        },
      );

      expect(exitCode).toBe(0);
      expect(stdout.join("\n")).toContain("file:///tmp/report.html");
    });

    test("forwards options.env to openStore across createLighthouseCliContext and runLighthouseOpenCommand", async () => {
      const customEnv = { DEVTOOLS_DB_PATH: "/tmp/custom-env.sqlite" };
      let contextCapturedEnv: Record<string, string | undefined> | undefined;
      const ctx = createLighthouseCliContext(
        { env: customEnv },
        {
          openStore: (opts?: { env?: Record<string, string | undefined> }) => {
            contextCapturedEnv = opts?.env;
            return store;
          },
        },
      );
      await ctx.openStore();
      ctx.closeStore();
      expect(contextCapturedEnv).toEqual(customEnv);

      let openCapturedEnv: Record<string, string | undefined> | undefined;
      await runLighthouseOpenCommand(
        "non-existent-id",
        { env: customEnv },
        {
          openStore: (opts?: { env?: Record<string, string | undefined> }) => {
            openCapturedEnv = opts?.env;
            return store;
          },
          error: () => {},
          exit: () => {},
        },
      );
      expect(openCapturedEnv).toEqual(customEnv);

      // Default @devtools/lighthouse openLighthouseStore path honors options.env without deps.openStore
      const tempDir = mkdtempSync(join(tmpdir(), "devtools-cli-env-db-"));
      const customDbPath = join(tempDir, "isolated.db");
      try {
        using seededStore = openLighthouseStore({ dbPath: customDbPath });
        seededStore.insertRun(
          makeSampleRow({
            id: "env-seed-111",
            htmlReportPath: "/tmp/env-seeded-report.html",
          }),
        );
        const stdout: string[] = [];
        let openExitCode: number | undefined;

        await runLighthouseOpenCommand(
          "env-seed-111",
          { env: { DEVTOOLS_DB_PATH: customDbPath, CI: "true" } },
          {
            fileExists: () => true,
            log: (msg) => stdout.push(msg),
            exit: (code) => {
              openExitCode = code;
            },
          },
        );

        expect(openExitCode).toBe(0);
        expect(stdout.join("\n")).toContain(
          "file:///tmp/env-seeded-report.html",
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test("isolates stdout and stderr color formatting in runLighthouseOpenCommand", async () => {
      store.insertRun(
        makeSampleRow({
          id: "open-tty-111",
          htmlReportPath: "/tmp/open-tty-report.html",
        }),
      );

      // Case 1: stdout redirected (non-TTY), stderr is TTY -> plain stdout, colored stderr
      const stdoutRedirected: string[] = [];
      await runLighthouseOpenCommand(
        "open-tty-111",
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: true,
          isStdoutTTY: false,
          openStore: () => store,
          fileExists: () => true,
          isHeadless: () => false,
          spawnOpener: () => {},
          log: (msg) => stdoutRedirected.push(msg),
        },
      );
      expect(stdoutRedirected.join("\n").includes("\x1b[")).toBe(false);
      expect(stdoutRedirected.join("\n")).toContain(
        "Opening Lighthouse HTML report at:",
      );

      const stderrInteractive: string[] = [];
      await runLighthouseOpenCommand(
        "open-tty-111",
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: true,
          isStdoutTTY: false,
          openStore: () => store,
          fileExists: () => false,
          error: (msg) => stderrInteractive.push(msg),
          exit: () => {},
        },
      );
      expect(stderrInteractive.join("\n").includes("\x1b[")).toBe(true);

      // Case 2: stdout is TTY, stderr redirected (non-TTY) -> colored stdout, plain stderr
      const stdoutInteractive: string[] = [];
      await runLighthouseOpenCommand(
        "open-tty-111",
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: false,
          isStdoutTTY: true,
          openStore: () => store,
          fileExists: () => true,
          isHeadless: () => false,
          spawnOpener: () => {},
          log: (msg) => stdoutInteractive.push(msg),
        },
      );
      expect(stdoutInteractive.join("\n").includes("\x1b[")).toBe(true);

      const stderrRedirected: string[] = [];
      await runLighthouseOpenCommand(
        "open-tty-111",
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: false,
          isStdoutTTY: true,
          openStore: () => store,
          fileExists: () => false,
          error: (msg) => stderrRedirected.push(msg),
          exit: () => {},
        },
      );
      expect(stderrRedirected.join("\n").includes("\x1b[")).toBe(false);

      // Case 3: NO_COLOR disables stdout color even when isStdoutTTY is true
      const stdoutNoColor: string[] = [];
      await runLighthouseOpenCommand(
        "open-tty-111",
        { env: { TERM: "xterm-256color", NO_COLOR: "1" } },
        {
          isStdoutTTY: true,
          openStore: () => store,
          fileExists: () => true,
          isHeadless: () => false,
          spawnOpener: () => {},
          log: (msg) => stdoutNoColor.push(msg),
        },
      );
      expect(stdoutNoColor.join("\n").includes("\x1b[")).toBe(false);

      // Case 4: isTTY fallback & omitted-deps default on createLighthouseCliContext
      const ctxFallbackTrue = createLighthouseCliContext(
        { env: { TERM: "xterm-256color" } },
        { isTTY: true },
      );
      expect(ctxFallbackTrue.pcStdout.green("ok").includes("\x1b[")).toBe(true);

      const ctxFallbackFalse = createLighthouseCliContext(
        { env: { TERM: "xterm-256color" } },
        { isTTY: false },
      );
      expect(ctxFallbackFalse.pcStdout.green("ok").includes("\x1b[")).toBe(
        false,
      );

      const ctxDefault = createLighthouseCliContext({
        env: { TERM: "xterm-256color" },
      });
      expect(ctxDefault.pcStdout.green("ok").includes("\x1b[")).toBe(
        Object.is(process.stdout.isTTY, true),
      );
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
            runAudit: async () => {
              throw new Error("Audit error");
            },
            writeStderr: () => {},
          },
        );
        expect(exitSpy).toHaveBeenCalledWith(1);

        await runLighthouseListCommand(
          {},
          {
            openStore: () => {
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
            openStore: () => {
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
