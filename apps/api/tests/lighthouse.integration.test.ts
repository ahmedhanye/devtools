import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createShutdownCoordinator } from "@devtools/core/node";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { API_ERROR_CODES, ApiErrorResponseSchema } from "@devtools/core";
import {
  EMPTY_LIGHTHOUSE_RUN_SUMMARY,
  openLighthouseStore,
  type LighthouseBatchExecutionResult,
  type LighthouseStore,
  type NewLighthouseRunRecord,
} from "@devtools/lighthouse";
import {
  ActiveAuditJobResponseSchema,
  LighthouseDiffResponseSchema,
  LighthouseRunDetailSchema,
  ListLighthouseRunsResponseSchema,
  TriggerLighthouseAuditResponseSchema,
} from "@devtools/lighthouse/schemas";
import { hc } from "hono/client";
import { createApp, type AppType } from "../src/index";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeBatchResult(
  url: string,
  perfScore = 94,
): LighthouseBatchExecutionResult {
  const lcpElement = {
    selector: "main > h1",
    snippet: "<h1>Hero</h1>",
    nodeLabel: "Hero",
    path: "1,HTML,1,BODY,0,MAIN,0,H1",
    lhId: "page-0-H1",
    boundingRect: {
      top: 0,
      bottom: 50,
      left: 0,
      right: 300,
      width: 300,
      height: 50,
    },
  };
  return {
    validatedUrl: url,
    formFactor: "mobile",
    throttlingMethod: "simulate",
    totalRuns: 1,
    normalized: {
      requestedUrl: url,
      finalUrl: url,
      scores: {
        performanceScore: perfScore,
        accessibilityScore: 100,
        bestPracticesScore: 92,
        seoScore: 98,
      },
      metrics: {
        lcpMs: 1200,
        cls: 0.02,
        tbtMs: 30,
        fcpMs: 750,
        siMs: 1100,
        ttfbMs: 85,
      },
      summary: {
        lcpElement,
        lcpPhases: null,
        clsCulprits: [],
        insights: [
          {
            id: "render-blocking-resources",
            title: "Eliminate render-blocking resources",
            description: "Resources block first paint",
            score: 0.5,
            scoreDisplayMode: "numeric",
            displayValue: "150 ms",
            metricSavings: { LCP: 150 },
            replacesAudits: [],
          },
        ],
        failedAudits: [],
        runWarnings: [],
        runtimeError: null,
        medianMetadata: null,
      },
    },
    reportJson: JSON.stringify({ requestedUrl: url }),
    reportHtml: `<!doctype html><html><body><h1>Lighthouse Report for ${url}</h1></body></html>`,
    representativeRunIndex: 0,
    durationMs: 1450,
  };
}

const DEFAULT_SAMPLE_ROW: Omit<
  NewLighthouseRunRecord,
  "jsonReportPath" | "htmlReportPath"
> = {
  id: "11111111-1111-4111-8111-111111111111",
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  formFactor: "mobile",
  throttlingMethod: "simulate",
  performanceScore: 85,
  accessibilityScore: 95,
  bestPracticesScore: 92,
  seoScore: 98,
  lcpMs: 1900,
  cls: 0.05,
  tbtMs: 120,
  fcpMs: 900,
  siMs: 1500,
  ttfbMs: 140,
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
  durationMs: 2500,
  createdAt: new Date("2026-11-10T10:00:00Z"),
};

function makeSampleRow(
  artifactsDir: string,
  overrides: Partial<NewLighthouseRunRecord> = {},
): NewLighthouseRunRecord {
  const id = overrides.id ?? DEFAULT_SAMPLE_ROW.id;
  return {
    ...DEFAULT_SAMPLE_ROW,
    jsonReportPath: join(artifactsDir, id, "report.json"),
    htmlReportPath: join(artifactsDir, id, "report.html"),
    ...overrides,
  };
}

describe("Lighthouse HTTP API Routes (/api/lighthouse)", () => {
  let store: LighthouseStore;
  let artifactsDir: string;

  beforeEach(() => {
    artifactsDir = mkdtempSync(join(tmpdir(), "devtools-api-lh-"));
    store = openLighthouseStore({ memory: true, artifactsDir });
  });

  afterEach(() => {
    store.close();
    rmSync(artifactsDir, { recursive: true, force: true });
  });

  describe("POST /api/lighthouse/audits & GET /api/lighthouse/audits/active", () => {
    it("returns 202 Accepted with AuditJob, reflects active job, and rejects concurrent triggers with 409 Conflict", async () => {
      const deferred = createDeferred<LighthouseBatchExecutionResult>();
      const app = createApp({
        store,
        artifactsDir,
        auditRunner: async () => deferred.promise,
      });

      // Initially inactive
      const inactiveRes = await app.request("/api/lighthouse/audits/active");
      expect(inactiveRes.status).toBe(200);
      expect(
        ActiveAuditJobResponseSchema.parse(await inactiveRes.json()),
      ).toEqual({ active: false, job: null });

      // Trigger first audit
      const triggerRes = await app.request("/api/lighthouse/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "http://localhost:3000",
          formFactor: "desktop",
          runs: 2,
          categories: ["performance", "seo"],
        }),
      });
      expect(triggerRes.status).toBe(202);
      const triggerJson = TriggerLighthouseAuditResponseSchema.parse(
        await triggerRes.json(),
      );
      expect(triggerJson.job.status).toBe("running");
      expect(triggerJson.job.url).toBe("http://localhost:3000/");
      expect(triggerJson.job.formFactor).toBe("desktop");
      expect(triggerJson.job.runs).toBe(2);

      // Active lookup finds the running job
      const activeRes = await app.request("/api/lighthouse/audits/active");
      expect(activeRes.status).toBe(200);
      const activeJson = ActiveAuditJobResponseSchema.parse(
        await activeRes.json(),
      );
      expect(activeJson.active).toBe(true);
      if (activeJson.active) {
        expect(activeJson.job.id).toBe(triggerJson.job.id);
      }

      // Concurrent trigger returns 409 Conflict with activeJobId
      const conflictRes = await app.request("/api/lighthouse/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      });
      expect(conflictRes.status).toBe(409);
      const conflictErr = ApiErrorResponseSchema.parse(
        await conflictRes.json(),
      );
      expect(conflictErr.error.code).toBe(API_ERROR_CODES.CONFLICT);
      expect(conflictErr.error.details).toEqual({
        activeJobId: triggerJson.job.id,
      });

      // Resolve job and confirm active clears
      deferred.resolve(makeBatchResult("http://localhost:3000/"));
      await new Promise((r) => setTimeout(r, 10));

      const afterDoneActive = await app.request(
        "/api/lighthouse/audits/active",
      );
      expect(
        ActiveAuditJobResponseSchema.parse(await afterDoneActive.json()),
      ).toEqual({ active: false, job: null });
    });

    it("returns 400 on malformed JSON and 422 on invalid target URL or Zod schema failure", async () => {
      const app = createApp({
        store,
        artifactsDir,
        auditRunner: async () => makeBatchResult("https://example.com/"),
      });

      const malformedRes = await app.request("/api/lighthouse/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      });
      expect(malformedRes.status).toBe(400);
      expect(
        ApiErrorResponseSchema.parse(await malformedRes.json()).error.code,
      ).toBe(API_ERROR_CODES.BAD_REQUEST);

      const badUrlRes = await app.request("/api/lighthouse/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "ftp://example.com/file" }),
      });
      expect(badUrlRes.status).toBe(422);
      expect(
        ApiErrorResponseSchema.parse(await badUrlRes.json()).error.code,
      ).toBe(API_ERROR_CODES.VALIDATION_ERROR);

      const badRunsRes = await app.request("/api/lighthouse/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com", runs: 0 }),
      });
      expect(badRunsRes.status).toBe(422);
      expect(
        ApiErrorResponseSchema.parse(await badRunsRes.json()).error.code,
      ).toBe(API_ERROR_CODES.VALIDATION_ERROR);

      const nonJsonRes = await app.request("/api/lighthouse/audits", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "url=https://example.com",
      });
      expect(nonJsonRes.status).toBe(415);
      expect(
        ApiErrorResponseSchema.parse(await nonJsonRes.json()).error.code,
      ).toBe(API_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE);

      const charsetRes = await app.request("/api/lighthouse/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ url: "https://example.com" }),
      });
      expect(charsetRes.status).toBe(202);
      await new Promise((r) => setTimeout(r, 10));
    });
  });

  describe("GET /api/lighthouse/runs & GET /api/lighthouse/runs/:id", () => {
    it("paginates and filters runs with total count while omitting summaryJson and disk paths", async () => {
      const run1Dir = join(
        artifactsDir,
        "aaaaaaaa-1111-4111-8111-111111111111",
      );
      mkdirSync(run1Dir, { recursive: true });
      const run1Html = join(run1Dir, "report.html");
      writeFileSync(run1Html, "<html><body>Run 1</body></html>");

      store.insertRun(
        makeSampleRow(artifactsDir, {
          id: "aaaaaaaa-1111-4111-8111-111111111111",
          url: "https://docs.example.com/intro",
          formFactor: "desktop",
          htmlReportPath: run1Html,
          createdAt: new Date("2026-11-10T12:00:00Z"),
        }),
      );
      store.insertRun(
        makeSampleRow(artifactsDir, {
          id: "bbbbbbbb-2222-4222-8222-222222222222",
          url: "https://example.com/",
          formFactor: "mobile",
          createdAt: new Date("2026-11-10T11:00:00Z"),
        }),
      );
      store.insertRun(
        makeSampleRow(artifactsDir, {
          id: "cccccccc-3333-4333-8333-333333333333",
          url: "https://other.dev/",
          formFactor: "mobile",
          createdAt: new Date("2026-11-10T10:00:00Z"),
        }),
      );

      const app = createApp({ store, artifactsDir });

      const allRes = await app.request("/api/lighthouse/runs?limit=2&offset=0");
      expect(allRes.status).toBe(200);
      const allRaw = await allRes.json();
      const allData = ListLighthouseRunsResponseSchema.parse(allRaw);
      expect(allData.total).toBe(3);
      expect(allData.limit).toBe(2);
      expect(allData.offset).toBe(0);
      expect(allData.runs.map((r) => r.id)).toEqual([
        "aaaaaaaa-1111-4111-8111-111111111111",
        "bbbbbbbb-2222-4222-8222-222222222222",
      ]);
      expect(allData.runs[0]?.hasHtmlReport).toBe(true);
      expect(allData.runs[1]?.hasHtmlReport).toBe(false);

      const searchRes = await app.request(
        "/api/lighthouse/runs?search=EXAMPLE.COM&formFactor=desktop",
      );
      expect(searchRes.status).toBe(200);
      const searchData = ListLighthouseRunsResponseSchema.parse(
        await searchRes.json(),
      );
      expect(searchData.total).toBe(1);
      expect(searchData.runs[0]?.id).toBe(
        "aaaaaaaa-1111-4111-8111-111111111111",
      );

      const exactUrlRes = await app.request(
        "/api/lighthouse/runs?url=https%3A%2F%2Fother.dev%2F",
      );
      expect(exactUrlRes.status).toBe(200);
      const exactData = ListLighthouseRunsResponseSchema.parse(
        await exactUrlRes.json(),
      );
      expect(exactData.total).toBe(1);
      expect(exactData.runs[0]?.id).toBe(
        "cccccccc-3333-4333-8333-333333333333",
      );

      const invalidQueryRes = await app.request(
        "/api/lighthouse/runs?limit=999",
      );
      expect(invalidQueryRes.status).toBe(422);
      expect(
        ApiErrorResponseSchema.parse(await invalidQueryRes.json()).error.code,
      ).toBe(API_ERROR_CODES.VALIDATION_ERROR);
    });

    it("resolves single run detail by full UUID or unique prefix, returning 404/409 on missing/ambiguous IDs", async () => {
      store.insertRun(
        makeSampleRow(artifactsDir, {
          id: "abcdef11-1111-4111-8111-111111111111",
        }),
      );
      store.insertRun(
        makeSampleRow(artifactsDir, {
          id: "abcdef22-2222-4222-8222-222222222222",
        }),
      );

      const app = createApp({ store, artifactsDir });

      const byPrefix = await app.request("/api/lighthouse/runs/abcdef11");
      expect(byPrefix.status).toBe(200);
      const detail = LighthouseRunDetailSchema.parse(await byPrefix.json());
      expect(detail.id).toBe("abcdef11-1111-4111-8111-111111111111");
      expect(detail.summary.insights).toEqual([]);

      const missing = await app.request("/api/lighthouse/runs/999999");
      expect(missing.status).toBe(404);
      expect(
        ApiErrorResponseSchema.parse(await missing.json()).error.code,
      ).toBe(API_ERROR_CODES.NOT_FOUND);

      const ambiguous = await app.request("/api/lighthouse/runs/abcdef");
      expect(ambiguous.status).toBe(409);
      expect(
        ApiErrorResponseSchema.parse(await ambiguous.json()).error.code,
      ).toBe(API_ERROR_CODES.CONFLICT);

      using uninitializedStore = openLighthouseStore({
        memory: true,
        autoInit: false,
        artifactsDir,
      });
      const brokenApp = createApp({ store: uninitializedStore, artifactsDir });
      const internalErrRes = await brokenApp.request(
        "/api/lighthouse/runs/abcdef11",
      );
      expect(internalErrRes.status).toBe(500);
      expect(
        ApiErrorResponseSchema.parse(await internalErrRes.json()).error.code,
      ).toBe(API_ERROR_CODES.INTERNAL_ERROR);
    });
  });

  describe("GET /api/lighthouse/runs/:id/report", () => {
    it("serves report.html inline with CSP sandbox opaque-origin isolation and nosniff headers", async () => {
      const id = "dddddddd-4444-4444-8444-444444444444";
      const runDir = join(artifactsDir, id);
      mkdirSync(runDir, { recursive: true });
      const reportPath = join(runDir, "report.html");
      writeFileSync(
        reportPath,
        "<!doctype html><html><body><script>window.__LIGHTHOUSE_JSON__={};</script></body></html>",
      );

      store.insertRun(
        makeSampleRow(artifactsDir, { id, htmlReportPath: reportPath }),
      );

      const app = createApp({ store, artifactsDir });
      const res = await app.request(`/api/lighthouse/runs/${id}/report`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toBe(
        "sandbox allow-scripts allow-popups allow-downloads; frame-ancestors 'self'",
      );
      expect(await res.text()).toContain("__LIGHTHOUSE_JSON__");

      // Sandboxed report.html runs in opaque null origin; API rejects Origin: null, cross-site, and evil Host
      const opaqueOriginRes = await app.request(
        `/api/lighthouse/runs/${id}/report`,
        { headers: { Origin: "null" } },
      );
      expect(opaqueOriginRes.status).toBe(403);

      const crossSiteReportRes = await app.request(
        `/api/lighthouse/runs/${id}/report`,
        { headers: { "Sec-Fetch-Site": "CROSS-SITE" } },
      );
      expect(crossSiteReportRes.status).toBe(403);

      const evilHostStreamRes = await app.request(
        `/api/lighthouse/audits/some-job/stream`,
        { headers: { Host: "evil.example.com" } },
      );
      expect(evilHostStreamRes.status).toBe(403);
    });

    it("returns 404 when report file is missing or escapes artifactsDir", async () => {
      const outsideDir = mkdtempSync(
        join(tmpdir(), "devtools-outside-report-"),
      );
      const outsideFile = join(outsideDir, "secret.html");
      writeFileSync(outsideFile, "<html>secret</html>");

      const symlinkRunDir = join(artifactsDir, "symlink-run");
      mkdirSync(symlinkRunDir, { recursive: true });
      const symlinkFile = join(symlinkRunDir, "report.html");
      symlinkSync(outsideFile, symlinkFile);

      try {
        store.insertRun(
          makeSampleRow(artifactsDir, {
            id: "eeeeeeee-5555-4555-8555-555555555555",
            htmlReportPath: join(artifactsDir, "missing", "report.html"),
          }),
        );
        store.insertRun(
          makeSampleRow(artifactsDir, {
            id: "ffffffff-6666-4666-8666-666666666666",
            htmlReportPath: symlinkFile,
          }),
        );

        const app = createApp({ store, artifactsDir });

        const missingFileRes = await app.request(
          "/api/lighthouse/runs/eeeeeeee-5555-4555-8555-555555555555/report",
        );
        expect(missingFileRes.status).toBe(404);
        expect(
          ApiErrorResponseSchema.parse(await missingFileRes.json()).error.code,
        ).toBe(API_ERROR_CODES.NOT_FOUND);

        const escapedRes = await app.request(
          "/api/lighthouse/runs/ffffffff-6666-4666-8666-666666666666/report",
        );
        expect(escapedRes.status).toBe(404);
        expect(
          ApiErrorResponseSchema.parse(await escapedRes.json()).error.code,
        ).toBe(API_ERROR_CODES.NOT_FOUND);

        const unknownRunRes = await app.request(
          "/api/lighthouse/runs/999999/report",
        );
        expect(unknownRunRes.status).toBe(404);
        expect(
          ApiErrorResponseSchema.parse(await unknownRunRes.json()).error.code,
        ).toBe(API_ERROR_CODES.NOT_FOUND);
      } finally {
        rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });

  describe("GET /api/lighthouse/diff", () => {
    it("returns baseline, comparison, and shared score/CWV/insight deltas", async () => {
      store.insertRun(
        makeSampleRow(artifactsDir, {
          id: "11111111-aaaa-4111-8111-111111111111",
          performanceScore: 70,
          lcpMs: 2500,
          summaryJson: {
            lcpElement: null,
            lcpPhases: null,
            clsCulprits: [],
            insights: [
              {
                id: "unused-js",
                title: "Reduce unused JS",
                description: "desc",
                score: 0.3,
                scoreDisplayMode: "numeric",
                displayValue: null,
                metricSavings: { LCP: 400 },
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
        makeSampleRow(artifactsDir, {
          id: "22222222-bbbb-4222-8222-222222222222",
          performanceScore: 95,
          lcpMs: 1200,
        }),
      );

      const app = createApp({ store, artifactsDir });
      const res = await app.request(
        "/api/lighthouse/diff?baseline=11111111&comparison=22222222",
      );
      expect(res.status).toBe(200);
      const parsed = LighthouseDiffResponseSchema.parse(await res.json());
      expect(parsed.deltas.scores.performanceScore).toBe(25);
      expect(parsed.deltas.metrics.lcpMs).toBe(-1300);
      expect(parsed.deltas.insights.resolved).toEqual([
        { id: "unused-js", title: "Reduce unused JS" },
      ]);
    });

    it("handles malformed and raw-corrupt summary_json across /runs, /runs/:id, and /diff in both directions", async () => {
      const dbPath = join(artifactsDir, "corrupt-summary.db");
      using corruptStore = openLighthouseStore({ dbPath, artifactsDir });

      const validId = "33333333-cccc-4333-8333-333333333333";
      const malformedId = "44444444-dddd-4444-8444-444444444444";
      const rawCorruptId = "55555555-eeee-4555-8555-555555555555";

      const validSummary = {
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
            score: 0.16,
            causes: [],
          },
        ],
        insights: [
          {
            id: "render-blocking-insight",
            title: "Render blocking requests",
            description: "Requests block initial render.",
            score: 0.3,
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
      };

      corruptStore.insertRun(
        makeSampleRow(artifactsDir, {
          id: validId,
          performanceScore: 72,
          lcpMs: 2500,
          summaryJson: validSummary,
        }),
      );
      corruptStore.insertRun(
        makeSampleRow(artifactsDir, {
          id: malformedId,
          performanceScore: 80,
          lcpMs: 2000,
          summaryJson: {
            unexpected: true,
          } as unknown as NewLighthouseRunRecord["summaryJson"],
        }),
      );

      const rawDb = new Database(dbPath);
      try {
        rawDb
          .query(
            `INSERT INTO lighthouse_runs (
              id, url, final_url, form_factor, throttling_method,
              performance_score, accessibility_score, best_practices_score, seo_score,
              lcp_ms, cls, tbt_ms, fcp_ms, si_ms, ttfb_ms,
              summary_json, json_report_path, html_report_path, duration_ms, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            rawCorruptId,
            "https://example.com/",
            "https://example.com/",
            "mobile",
            "simulate",
            88,
            95,
            92,
            98,
            1800,
            0.03,
            90,
            1000,
            1500,
            120,
            "{not-valid-json",
            join(artifactsDir, rawCorruptId, "report.json"),
            join(artifactsDir, rawCorruptId, "report.html"),
            3500,
            Date.now(),
          );
      } finally {
        rawDb.close();
      }

      const app = createApp({ store: corruptStore, artifactsDir });

      const listRes = await app.request("/api/lighthouse/runs");
      expect(listRes.status).toBe(200);
      const listPayload = ListLighthouseRunsResponseSchema.parse(
        await listRes.json(),
      );
      expect(listPayload.total).toBe(3);

      const rawDetailRes = await app.request(
        `/api/lighthouse/runs/${rawCorruptId}`,
      );
      expect(rawDetailRes.status).toBe(200);
      const rawDetail = LighthouseRunDetailSchema.parse(
        await rawDetailRes.json(),
      );
      expect(rawDetail.summary).toEqual(EMPTY_LIGHTHOUSE_RUN_SUMMARY);

      const malformedDetailRes = await app.request(
        `/api/lighthouse/runs/${malformedId}`,
      );
      expect(malformedDetailRes.status).toBe(200);
      const malformedDetail = LighthouseRunDetailSchema.parse(
        await malformedDetailRes.json(),
      );
      expect(malformedDetail.summary).toEqual(EMPTY_LIGHTHOUSE_RUN_SUMMARY);

      const validToRawRes = await app.request(
        `/api/lighthouse/diff?baseline=${validId}&comparison=${rawCorruptId}`,
      );
      expect(validToRawRes.status).toBe(200);
      const validToRaw = LighthouseDiffResponseSchema.parse(
        await validToRawRes.json(),
      );
      expect(validToRaw.baseline.summary).toEqual(validSummary);
      expect(validToRaw.comparison.summary).toEqual(
        EMPTY_LIGHTHOUSE_RUN_SUMMARY,
      );
      expect(validToRaw.deltas.scores.performanceScore).toBe(16);
      expect(validToRaw.deltas.metrics.lcpMs).toBe(-700);
      expect(validToRaw.deltas.insights).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: null,
      });

      const rawToValidRes = await app.request(
        `/api/lighthouse/diff?baseline=${rawCorruptId}&comparison=${validId}`,
      );
      expect(rawToValidRes.status).toBe(200);
      const rawToValid = LighthouseDiffResponseSchema.parse(
        await rawToValidRes.json(),
      );
      expect(rawToValid.baseline.summary).toEqual(EMPTY_LIGHTHOUSE_RUN_SUMMARY);
      expect(rawToValid.comparison.summary).toEqual(validSummary);
      expect(rawToValid.deltas.insights).toEqual({
        resolved: [],
        regressed: [],
        clsCulpritDelta: null,
      });
    });

    it("returns 422 when query params are missing, 404 when not found, and 409 on ambiguous prefix", async () => {
      store.insertRun(
        makeSampleRow(artifactsDir, {
          id: "abcdef11-0000-4000-8000-000000000000",
        }),
      );
      store.insertRun(
        makeSampleRow(artifactsDir, {
          id: "abcdef22-0000-4000-8000-000000000000",
        }),
      );

      const app = createApp({ store, artifactsDir });

      const missingParams = await app.request(
        "/api/lighthouse/diff?baseline=abcdef11",
      );
      expect(missingParams.status).toBe(422);
      expect(
        ApiErrorResponseSchema.parse(await missingParams.json()).error.code,
      ).toBe(API_ERROR_CODES.VALIDATION_ERROR);

      const notFound = await app.request(
        "/api/lighthouse/diff?baseline=abcdef11&comparison=999999",
      );
      expect(notFound.status).toBe(404);

      const ambiguous = await app.request(
        "/api/lighthouse/diff?baseline=abcdef&comparison=abcdef11",
      );
      expect(ambiguous.status).toBe(409);
    });

    it("preserves AppType Hono RPC inference alongside app.shutdown()", async () => {
      const app = createApp({ store, artifactsDir });
      const client = hc<AppType>("http://127.0.0.1", {
        fetch: app.request as typeof fetch,
      });
      const [healthRes, runsRes] = await Promise.all([
        client.api.health.$get(),
        client.api.lighthouse.runs.$get(),
      ]);
      expect(healthRes.status).toBe(200);
      expect(runsRes.status).toBe(200);
      await app.shutdown();

      const rejectedDuringShutdown = await app.request(
        "/api/lighthouse/audits",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://example.com/" }),
        },
      );
      expect(rejectedDuringShutdown.status).toBe(503);
      expect(
        ApiErrorResponseSchema.parse(await rejectedDuringShutdown.json()).error
          .code,
      ).toBe(API_ERROR_CODES.SERVICE_UNAVAILABLE);
    });

    it("rejects POST /api/lighthouse/audits with 503 during Phase 1 ingress and mid-body shutdown race", async () => {
      const coordinator = createShutdownCoordinator();
      let releaseIngress!: () => void;
      const ingressGate = new Promise<void>((res) => {
        releaseIngress = res;
      });
      coordinator.register("ingress", async () => {
        await ingressGate;
      });
      const appWithCoord = createApp({ store, shutdown: coordinator });

      const shutdownPromise = coordinator.shutdown("SIGTERM");
      const duringIngressRes = await appWithCoord.request(
        "/api/lighthouse/audits",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://example.com/" }),
        },
      );
      expect(duringIngressRes.status).toBe(503);
      releaseIngress();
      await shutdownPromise;

      const bodyApp = createApp({ store });
      let enqueueBody!: (chunk: Uint8Array) => void;
      let closeBody!: () => void;
      const slowBody = new ReadableStream<Uint8Array>({
        start(controller) {
          enqueueBody = (c) => controller.enqueue(c);
          closeBody = () => controller.close();
        },
      });
      const pendingPost = bodyApp.request("/api/lighthouse/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: slowBody,
      });
      await Bun.sleep(10);
      const bodyShutdownPromise = bodyApp.shutdown();
      enqueueBody(
        new TextEncoder().encode(
          JSON.stringify({ url: "https://example.com/" }),
        ),
      );
      closeBody();
      const [bodyRaceRes] = await Promise.all([
        pendingPost,
        bodyShutdownPromise,
      ]);
      expect(bodyRaceRes.status).toBe(503);
      expect(
        ApiErrorResponseSchema.parse(await bodyRaceRes.json()).error.code,
      ).toBe(API_ERROR_CODES.SERVICE_UNAVAILABLE);
    });
  });

  describe("Concurrent Dual-App Instance Isolation", () => {
    it("isolates active jobs, stores, and independent shutdown lifecycles across dual createApp instances", async () => {
      const dirA = mkdtempSync(join(tmpdir(), "devtools-api-dual-a-"));
      const dirB = mkdtempSync(join(tmpdir(), "devtools-api-dual-b-"));
      const storeA = openLighthouseStore({ memory: true, artifactsDir: dirA });
      const storeB = openLighthouseStore({ memory: true, artifactsDir: dirB });

      try {
        storeA.insertRun(
          makeSampleRow(dirA, {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            url: "https://a.example/",
            finalUrl: "https://a.example/",
          }),
        );

        const deferredA = createDeferred<LighthouseBatchExecutionResult>();
        const appA = createApp({
          store: storeA,
          artifactsDir: dirA,
          auditRunner: async () => deferredA.promise,
        });
        const appB = createApp({
          store: storeB,
          artifactsDir: dirB,
          auditRunner: async () => makeBatchResult("https://b.example/", 88),
        });

        const triggerARes = await appA.request("/api/lighthouse/audits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://a.example/" }),
        });
        expect(triggerARes.status).toBe(202);

        const activeARes = await appA.request("/api/lighthouse/audits/active");
        const activeBRes = await appB.request("/api/lighthouse/audits/active");
        expect(
          ActiveAuditJobResponseSchema.parse(await activeARes.json()).active,
        ).toBe(true);
        expect(
          ActiveAuditJobResponseSchema.parse(await activeBRes.json()).active,
        ).toBe(false);

        const listARes = await appA.request("/api/lighthouse/runs");
        const listBRes = await appB.request("/api/lighthouse/runs");
        expect(
          ListLighthouseRunsResponseSchema.parse(await listARes.json()).runs,
        ).toHaveLength(1);
        expect(
          ListLighthouseRunsResponseSchema.parse(await listBRes.json()).runs,
        ).toHaveLength(0);

        // Shutting down appB must not affect appA
        await appB.shutdown();
        const postBRes = await appB.request("/api/lighthouse/audits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://b.example/" }),
        });
        expect(postBRes.status).toBe(503);

        const stillActiveARes = await appA.request(
          "/api/lighthouse/audits/active",
        );
        expect(stillActiveARes.status).toBe(200);
        expect(
          ActiveAuditJobResponseSchema.parse(await stillActiveARes.json())
            .active,
        ).toBe(true);

        deferredA.resolve(makeBatchResult("https://a.example/", 97));
        await new Promise((r) => setTimeout(r, 20));

        const afterDoneActiveARes = await appA.request(
          "/api/lighthouse/audits/active",
        );
        expect(
          ActiveAuditJobResponseSchema.parse(await afterDoneActiveARes.json())
            .active,
        ).toBe(false);

        const listAAfterRes = await appA.request("/api/lighthouse/runs");
        expect(
          ListLighthouseRunsResponseSchema.parse(await listAAfterRes.json())
            .runs,
        ).toHaveLength(2);
        expect(storeB.listRuns()).toHaveLength(0);

        await appA.shutdown();
      } finally {
        storeA.close();
        storeB.close();
        rmSync(dirA, { recursive: true, force: true });
        rmSync(dirB, { recursive: true, force: true });
      }
    });
  });
});
