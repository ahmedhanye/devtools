import { describe, expect, it } from "bun:test";
import {
  ActiveAuditJobResponseSchema,
  AuditJobSchema,
  AuditSseCompleteEventSchema,
  AuditSseErrorEventSchema,
  AuditSseProgressEventSchema,
  AuditTargetUrlSchema,
  DEFAULT_LIGHTHOUSE_CATEGORIES,
  LighthouseDiffQuerySchema,
  LighthouseDiffResponseSchema,
  LighthouseRunDetailSchema,
  ListLighthouseRunsQuerySchema,
  ListLighthouseRunsResponseSchema,
  TriggerLighthouseAuditRequestSchema,
  TriggerLighthouseAuditResponseSchema,
  normalizeLighthouseAuditRequest,
} from "../src/schemas";

const sampleSummary = {
  lcpElement: null,
  lcpPhases: null,
  clsCulprits: [],
  insights: [],
  failedAudits: [],
  runWarnings: [],
  runtimeError: null,
  medianMetadata: null,
};

const sampleRunItem = {
  id: "11111111-1111-4111-8111-111111111111",
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  formFactor: "mobile" as const,
  throttlingMethod: "simulate" as const,
  performanceScore: 95,
  accessibilityScore: 100,
  bestPracticesScore: 92,
  seoScore: 98,
  lcpMs: 1200,
  cls: 0.01,
  tbtMs: 25,
  fcpMs: 750,
  siMs: 1100,
  ttfbMs: 80,
  durationMs: 3200,
  createdAt: "2026-11-10T20:00:00.000Z",
  hasHtmlReport: true,
};

const sampleRunDetail = {
  ...sampleRunItem,
  summary: sampleSummary,
};

describe("@devtools/lighthouse/schemas", () => {
  describe("AuditTargetUrlSchema & TriggerLighthouseAuditRequestSchema", () => {
    it("accepts http:// and https:// URLs including localhost and normalizes via URL parser", () => {
      expect(AuditTargetUrlSchema.parse("http://localhost:3000")).toBe(
        "http://localhost:3000/",
      );
      expect(AuditTargetUrlSchema.parse("  https://example.com/path  ")).toBe(
        "https://example.com/path",
      );
    });

    it("rejects empty strings, whitespace-only strings, malformed URLs, and non-HTTP(S) schemes", () => {
      expect(() => AuditTargetUrlSchema.parse("")).toThrow(/required/i);
      expect(() => AuditTargetUrlSchema.parse("   ")).toThrow(/required/i);
      expect(() => AuditTargetUrlSchema.parse("not-a-url")).toThrow(
        /Invalid target URL/i,
      );
      expect(() => AuditTargetUrlSchema.parse("ftp://example.com")).toThrow(
        /only http: and https:/i,
      );
      expect(() => AuditTargetUrlSchema.parse("file:///etc/passwd")).toThrow(
        /only http: and https:/i,
      );
    });

    it("validates trigger payload and applies canonical defaults via normalizeLighthouseAuditRequest", () => {
      const parsed = TriggerLighthouseAuditRequestSchema.parse({
        url: "https://example.com",
      });
      expect(normalizeLighthouseAuditRequest(parsed)).toEqual({
        url: "https://example.com/",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        runs: 1,
        categories: [...DEFAULT_LIGHTHOUSE_CATEGORIES],
      });

      const minLower = TriggerLighthouseAuditRequestSchema.parse({
        url: "https://example.com",
        runs: 1,
        categories: ["performance"],
      });
      expect(normalizeLighthouseAuditRequest(minLower)).toEqual({
        url: "https://example.com/",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        runs: 1,
        categories: ["performance"],
      });

      const custom = TriggerLighthouseAuditRequestSchema.parse({
        url: "http://127.0.0.1:4000/app",
        formFactor: "desktop",
        throttlingMethod: "provided",
        runs: 3,
        categories: ["performance", "seo"],
      });
      expect(normalizeLighthouseAuditRequest(custom)).toEqual({
        url: "http://127.0.0.1:4000/app",
        formFactor: "desktop",
        throttlingMethod: "provided",
        runs: 3,
        categories: ["performance", "seo"],
      });
    });

    it("rejects unknown fields, invalid runs, empty categories, and unsupported categories", () => {
      expect(() =>
        TriggerLighthouseAuditRequestSchema.parse({
          url: "https://example.com",
          runs: 0,
        }),
      ).toThrow();
      expect(() =>
        TriggerLighthouseAuditRequestSchema.parse({
          url: "https://example.com",
          runs: 1.5,
        }),
      ).toThrow();
      expect(() =>
        TriggerLighthouseAuditRequestSchema.parse({
          url: "https://example.com",
          categories: [],
        }),
      ).toThrow();
      expect(() =>
        TriggerLighthouseAuditRequestSchema.parse({
          url: "https://example.com",
          categories: ["unknown-category"],
        }),
      ).toThrow();
      expect(() =>
        TriggerLighthouseAuditRequestSchema.parse({
          url: "https://example.com",
          extraField: true,
        }),
      ).toThrow();
    });
  });

  describe("ListLighthouseRunsQuerySchema & ListLighthouseRunsResponseSchema", () => {
    it("parses valid query filters and integer limit/offset bounds", () => {
      expect(ListLighthouseRunsQuerySchema.parse({})).toEqual({});
      expect(
        ListLighthouseRunsQuerySchema.parse({
          url: "https://example.com/",
          search: "example",
          formFactor: "desktop",
          limit: " 25 ",
          offset: "10",
        }),
      ).toEqual({
        url: "https://example.com/",
        search: "example",
        formFactor: "desktop",
        limit: 25,
        offset: 10,
      });
      expect(
        ListLighthouseRunsQuerySchema.parse({ limit: 1, offset: 1 }),
      ).toEqual({
        limit: 1,
        offset: 1,
      });
      expect(
        ListLighthouseRunsQuerySchema.parse({ limit: 100, offset: 0 }),
      ).toEqual({
        limit: 100,
        offset: 0,
      });
    });

    it("rejects out-of-range, empty, whitespace, non-integer, or unknown query parameters", () => {
      expect(() =>
        ListLighthouseRunsQuerySchema.parse({ limit: "0" }),
      ).toThrow();
      expect(() =>
        ListLighthouseRunsQuerySchema.parse({ limit: "101" }),
      ).toThrow();
      expect(() =>
        ListLighthouseRunsQuerySchema.parse({ limit: "" }),
      ).toThrow();
      expect(() =>
        ListLighthouseRunsQuerySchema.parse({ limit: "abc" }),
      ).toThrow();
      expect(() =>
        ListLighthouseRunsQuerySchema.parse({ limit: "12.5" }),
      ).toThrow();
      expect(() =>
        ListLighthouseRunsQuerySchema.parse({ offset: "-1" }),
      ).toThrow();
      expect(() =>
        ListLighthouseRunsQuerySchema.parse({ url: "   " }),
      ).toThrow();
      expect(() =>
        ListLighthouseRunsQuerySchema.parse({ search: "   " }),
      ).toThrow();
      expect(() =>
        ListLighthouseRunsQuerySchema.parse({ unknown: "1" }),
      ).toThrow();
    });

    it("validates paginated runs response while rejecting leaked disk paths", () => {
      const valid = ListLighthouseRunsResponseSchema.parse({
        runs: [sampleRunItem],
        total: 1,
        limit: 50,
        offset: 0,
      });
      expect(valid.runs[0]?.hasHtmlReport).toBe(true);

      expect(() =>
        ListLighthouseRunsResponseSchema.parse({
          runs: [{ ...sampleRunItem, htmlReportPath: "/tmp/report.html" }],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      ).toThrow();
    });
  });

  describe("Run Detail, Diff, Job & SSE Event Schemas", () => {
    it("validates run detail and pairwise diff query/response envelopes", () => {
      expect(LighthouseRunDetailSchema.parse(sampleRunDetail).id).toBe(
        sampleRunDetail.id,
      );
      expect(
        LighthouseDiffQuerySchema.parse({
          baseline: "111111",
          comparison: "222222",
        }),
      ).toEqual({
        baseline: "111111",
        comparison: "222222",
      });
      expect(() =>
        LighthouseDiffQuerySchema.parse({ baseline: "111111" }),
      ).toThrow();
      expect(() =>
        LighthouseDiffQuerySchema.parse({
          baseline: "   ",
          comparison: "222222",
        }),
      ).toThrow();
      expect(() =>
        LighthouseDiffQuerySchema.parse({
          baseline: "111111",
          comparison: "   ",
        }),
      ).toThrow();

      const diffPayload = LighthouseDiffResponseSchema.parse({
        baseline: sampleRunDetail,
        comparison: sampleRunDetail,
        deltas: {
          scores: {
            performanceScore: 0,
            accessibilityScore: 0,
            bestPracticesScore: 0,
            seoScore: 0,
          },
          metrics: {
            lcpMs: 0,
            cls: 0,
            tbtMs: 0,
            fcpMs: 0,
            siMs: 0,
            ttfbMs: 0,
          },
          insights: {
            resolved: [],
            regressed: [{ id: "render-blocking", title: "Render blocking" }],
            clsCulpritDelta: -1,
          },
        },
      });
      expect(diffPayload.deltas.insights.clsCulpritDelta).toBe(-1);
    });

    it("validates AuditJob, active lookup, and SSE progress/complete/error events", () => {
      const progressEvent = AuditSseProgressEventSchema.parse({
        jobId: "job-1",
        status: "running",
        stage: "navigating",
        message: "Navigating to https://example.com/",
        runIndex: 0,
        totalRuns: 1,
        timestamp: "2026-11-10T20:00:01.000Z",
      });

      const job = AuditJobSchema.parse({
        id: "job-1",
        url: "https://example.com/",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        runs: 1,
        categories: ["performance", "accessibility", "best-practices", "seo"],
        status: "running",
        startedAt: "2026-11-10T20:00:00.000Z",
        completedAt: null,
        latestProgress: progressEvent,
        runId: null,
        error: null,
      });

      expect(TriggerLighthouseAuditResponseSchema.parse({ job }).job.id).toBe(
        "job-1",
      );
      expect(
        ActiveAuditJobResponseSchema.parse({ active: true, job }).active,
      ).toBe(true);
      expect(
        ActiveAuditJobResponseSchema.parse({ active: false, job: null }).job,
      ).toBeNull();

      expect(
        AuditSseCompleteEventSchema.parse({
          jobId: "job-1",
          status: "completed",
          runId: sampleRunDetail.id,
          run: sampleRunDetail,
        }).runId,
      ).toBe(sampleRunDetail.id);

      expect(
        AuditSseErrorEventSchema.parse({
          jobId: "job-1",
          status: "failed",
          error: {
            code: "BROWSER_NOT_FOUND",
            message: "No Chromium browser found",
          },
        }).error.code,
      ).toBe("BROWSER_NOT_FOUND");
    });
  });
});
