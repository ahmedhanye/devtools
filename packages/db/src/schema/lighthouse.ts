import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Normalized DOM element attribution stored inside `lighthouse_runs.summary_json`.
 */
export interface LighthouseSummaryElementData {
  selector: string;
  snippet: string | null;
  nodeLabel: string | null;
  path: string | null;
  lhId: string | null;
  boundingRect: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  } | null;
}

/**
 * Warm structured summary JSON stored inside `lighthouse_runs.summary_json`.
 *
 * @remarks
 * Defined directly in `@devtools/db` so database schemas remain self-contained
 * without importing `@devtools/lighthouse`.
 */
export interface LighthouseRunSummaryData {
  /** Largest Contentful Paint (LCP) DOM element attribution, or `null` when unavailable. */
  lcpElement: LighthouseSummaryElementData | null;
  /** Four LCP phase durations in milliseconds from `lcp-breakdown-insight`, or `null` when unavailable. */
  lcpPhases: {
    timeToFirstByteMs: number | null;
    resourceLoadDelayMs: number | null;
    resourceLoadDurationMs: number | null;
    elementRenderDelayMs: number | null;
  } | null;
  /** Cumulative Layout Shift (CLS) culprit elements and root causes from `cls-culprits-insight`. */
  clsCulprits: Array<{
    element: LighthouseSummaryElementData;
    score: number;
    causes: Array<{
      cause: string;
      url: string | null;
      selector: string | null;
    }>;
  }>;
  /** Prioritized Lighthouse v13 `*-insight` diagnostics. */
  insights: Array<{
    id: string;
    title: string;
    description: string;
    score: number | null;
    scoreDisplayMode: string;
    displayValue: string | null;
    metricSavings: Record<string, number>;
    replacesAudits: string[];
  }>;
  /** Actionable failed or warning audits across all audited categories. */
  failedAudits: Array<{
    id: string;
    title: string;
    description: string;
    category: string | null;
    score: number | null;
    scoreDisplayMode: string;
    displayValue: string | null;
  }>;
  /** Warnings emitted by Lighthouse during page navigation and gathering. */
  runWarnings: string[];
  /** Fatal runtime error reported inside the LHR, if any. */
  runtimeError: {
    code: string;
    message: string;
  } | null;
  /** Multi-run representative selection metadata when `--runs > 1`, or `null` for single runs. */
  medianMetadata: {
    totalRuns: number;
    selectedRunIndex: number;
    medianFcpMs: number;
    medianInteractiveMs: number;
    runDistances: Array<{
      runIndex: number;
      fcpMs: number;
      interactiveMs: number;
      distanceSquared: number;
    }>;
  } | null;
}

/**
 * Persistence table storing hot category scores, Core Web Vitals, warm `summary_json`,
 * and cold disk report paths for completed Lighthouse Audit Runs.
 */
export const lighthouseRuns = sqliteTable(
  "lighthouse_runs",
  {
    /** Unique run identifier (UUID). */
    id: text("id").primaryKey(),
    /** Requested target URL supplied to the audit runner. */
    url: text("url").notNull(),
    /** Final resolved URL after HTTP redirects. */
    finalUrl: text("final_url").notNull(),
    /** Emulation form factor (`"mobile"` or `"desktop"`). */
    formFactor: text("form_factor", {
      enum: ["mobile", "desktop"],
    }).notNull(),
    /** Network and CPU throttling method (`"simulate"`, `"devtools"`, or `"provided"`). */
    throttlingMethod: text("throttling_method", {
      enum: ["simulate", "devtools", "provided"],
    }).notNull(),
    /** Performance category score (`0-100` integer), or `null` if skipped/errored. */
    performanceScore: integer("performance_score"),
    /** Accessibility category score (`0-100` integer), or `null` if skipped/errored. */
    accessibilityScore: integer("accessibility_score"),
    /** Best Practices category score (`0-100` integer), or `null` if skipped/errored. */
    bestPracticesScore: integer("best_practices_score"),
    /** SEO category score (`0-100` integer), or `null` if skipped/errored. */
    seoScore: integer("seo_score"),
    /** Largest Contentful Paint (LCP) in milliseconds. */
    lcpMs: real("lcp_ms"),
    /** Cumulative Layout Shift (CLS) unitless score. */
    cls: real("cls"),
    /** Total Blocking Time (TBT) in milliseconds. */
    tbtMs: real("tbt_ms"),
    /** First Contentful Paint (FCP) in milliseconds. */
    fcpMs: real("fcp_ms"),
    /** Speed Index (SI) in milliseconds. */
    siMs: real("si_ms"),
    /** Time to First Byte (TTFB) in milliseconds. */
    ttfbMs: real("ttfb_ms"),
    /** Warm structured Audit Summary (`LighthouseRunSummaryData`). */
    summaryJson: text("summary_json", { mode: "json" })
      .$type<LighthouseRunSummaryData>()
      .notNull(),
    /** Absolute path to the cold `report.json` LHR artifact on disk. */
    jsonReportPath: text("json_report_path").notNull(),
    /** Absolute path to the cold `report.html` viewer artifact on disk. */
    htmlReportPath: text("html_report_path").notNull(),
    /** Total wall-clock execution duration in milliseconds across all iterations. */
    durationMs: integer("duration_ms").notNull(),
    /** Timestamp (in epoch milliseconds) when the run record was persisted. */
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("lighthouse_runs_url_form_factor_created_at_idx").on(
      table.url,
      table.formFactor,
      table.createdAt,
    ),
    index("lighthouse_runs_created_at_idx").on(table.createdAt),
  ],
);

/**
 * Row model selected from the {@link lighthouseRuns} table.
 */
export type LighthouseRunRow = typeof lighthouseRuns.$inferSelect;

/**
 * Insert payload model for the {@link lighthouseRuns} table.
 */
export type NewLighthouseRunRow = typeof lighthouseRuns.$inferInsert;
