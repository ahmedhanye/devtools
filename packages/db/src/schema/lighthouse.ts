import {
  customType,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const tolerantJsonText = customType<{
  data: Record<string, unknown> | null;
  driverData: string;
}>({
  dataType() {
    return "text";
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
  fromDriver(value) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
    return isJsonRecord(parsed) ? parsed : null;
  },
});

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
    /** Warm structured Audit Summary JSON payload validated at the Lighthouse persistence boundary. */
    summaryJson: tolerantJsonText("summary_json").notNull(),
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
