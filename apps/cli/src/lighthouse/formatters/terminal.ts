import type { LighthouseRunRow } from "@devtools/db";
import type { NormalizedLighthouseRun } from "@devtools/lighthouse";
import {
  type ColorOptions,
  type TerminalColors,
  getColors,
} from "../../colors";

function formatScoreBadge(score: number | null, c: TerminalColors): string {
  if (score === null || score === undefined) return c.dim("N/A");
  const rounded = Math.round(score);
  if (rounded >= 90) return c.green(c.bold(String(rounded)));
  if (rounded >= 50) return c.yellow(c.bold(String(rounded)));
  return c.red(c.bold(String(rounded)));
}

function formatScoreDelta(
  curr: number | null,
  prev: number | null | undefined,
  c: TerminalColors,
): string {
  if (
    curr === null ||
    curr === undefined ||
    prev === null ||
    prev === undefined
  ) {
    return "";
  }
  const delta = Math.round(curr) - Math.round(prev);
  if (delta > 0) return c.green(`(+${delta})`);
  if (delta < 0) return c.red(`(${delta})`);
  return c.dim("(0)");
}

function formatMetricDelta(
  curr: number | null,
  prev: number | null | undefined,
  unit = "ms",
  digits = 0,
  c: TerminalColors = getColors(),
): string {
  if (
    curr === null ||
    curr === undefined ||
    prev === null ||
    prev === undefined
  ) {
    return "";
  }
  const delta = curr - prev;
  // Lower is better for CWV
  const isZero = Math.abs(delta) < 0.0001;
  if (isZero) return c.dim("(0)");

  const formattedNum =
    digits > 0
      ? delta > 0
        ? `+${delta.toFixed(digits)}`
        : delta.toFixed(digits)
      : delta > 0
        ? `+${Math.round(delta).toLocaleString("en-US")}`
        : `${Math.round(delta).toLocaleString("en-US")}`;

  const str = unit ? `${formattedNum} ${unit}` : formattedNum;
  if (delta < 0) return c.green(`(${str})`);
  return c.red(`(${str})`);
}

function formatMs(
  val: number | null | undefined,
  c: TerminalColors = getColors(),
): string {
  if (val === null || val === undefined) return c.dim("N/A");
  return `${Math.round(val).toLocaleString("en-US")} ms`;
}

function formatFloat(
  val: number | null | undefined,
  digits = 3,
  c: TerminalColors = getColors(),
): string {
  if (val === null || val === undefined) return c.dim("N/A");
  return val.toFixed(digits);
}

function getRatingBadge(
  metric: "lcp" | "cls" | "tbt" | "fcp" | "si" | "ttfb",
  val: number | null | undefined,
  c: TerminalColors,
): string {
  if (val === null || val === undefined) return c.dim("N/A".padEnd(20));

  let status: "good" | "needs-improvement" | "poor" = "poor";

  switch (metric) {
    case "lcp":
      status =
        val <= 2500 ? "good" : val <= 4000 ? "needs-improvement" : "poor";
      break;
    case "cls":
      status = val <= 0.1 ? "good" : val <= 0.25 ? "needs-improvement" : "poor";
      break;
    case "tbt":
      status = val <= 200 ? "good" : val <= 600 ? "needs-improvement" : "poor";
      break;
    case "fcp":
      status =
        val <= 1800 ? "good" : val <= 3000 ? "needs-improvement" : "poor";
      break;
    case "si":
      status =
        val <= 3400 ? "good" : val <= 5800 ? "needs-improvement" : "poor";
      break;
    case "ttfb":
      status = val <= 800 ? "good" : val <= 1800 ? "needs-improvement" : "poor";
      break;
  }

  let text = "Poor";
  let colorFn = c.red;
  if (status === "good") {
    text = "Good";
    colorFn = c.green;
  } else if (status === "needs-improvement") {
    text = "Needs Improvement";
    colorFn = c.yellow;
  }
  return colorFn(text.padEnd(20));
}

/**
 * Formats a completed Lighthouse audit run into a human-readable terminal table.
 *
 * @param run - Normalized audit result.
 * @param previousRun - Optional previous run row for inline diffing.
 * @param options - Optional terminal color configuration.
 * @returns Color-coded terminal output string.
 */
export function formatTerminalSummary(
  run: NormalizedLighthouseRun,
  previousRun?: LighthouseRunRow | null,
  options: ColorOptions = {},
): string {
  const c = getColors(options);
  const lines: string[] = [];

  lines.push("");
  lines.push(
    `${c.bold("Lighthouse Audit Report:")} ${c.cyan(run.requestedUrl)}`,
  );
  if (previousRun) {
    lines.push(
      c.dim(
        `Baseline: Run ${previousRun.id.slice(0, 8)} (${new Date(previousRun.createdAt).toLocaleString("en-US", { timeZone: "UTC" })})`,
      ),
    );
  }
  lines.push("═".repeat(64));

  // Category Scores
  const pDelta = formatScoreDelta(
    run.scores.performanceScore,
    previousRun?.performanceScore,
    c,
  );
  const aDelta = formatScoreDelta(
    run.scores.accessibilityScore,
    previousRun?.accessibilityScore,
    c,
  );
  const bDelta = formatScoreDelta(
    run.scores.bestPracticesScore,
    previousRun?.bestPracticesScore,
    c,
  );
  const sDelta = formatScoreDelta(
    run.scores.seoScore,
    previousRun?.seoScore,
    c,
  );

  lines.push(c.bold("Category Scores:"));
  lines.push(
    `  Performance:     ${formatScoreBadge(run.scores.performanceScore, c)} ${pDelta}`,
  );
  lines.push(
    `  Accessibility:   ${formatScoreBadge(run.scores.accessibilityScore, c)} ${aDelta}`,
  );
  lines.push(
    `  Best Practices:  ${formatScoreBadge(run.scores.bestPracticesScore, c)} ${bDelta}`,
  );
  lines.push(
    `  SEO:             ${formatScoreBadge(run.scores.seoScore, c)} ${sDelta}`,
  );
  lines.push("─".repeat(64));

  // Core Web Vitals
  lines.push(c.bold("Core Web Vitals:"));
  const cwvRows = [
    {
      name: "LCP (Largest Contentful Paint)",
      val: formatMs(run.metrics.lcpMs, c),
      rating: getRatingBadge("lcp", run.metrics.lcpMs, c),
      delta: formatMetricDelta(
        run.metrics.lcpMs,
        previousRun?.lcpMs,
        "ms",
        0,
        c,
      ),
    },
    {
      name: "CLS (Cumulative Layout Shift)",
      val: formatFloat(run.metrics.cls, 3, c),
      rating: getRatingBadge("cls", run.metrics.cls, c),
      delta: formatMetricDelta(run.metrics.cls, previousRun?.cls, "", 3, c),
    },
    {
      name: "TBT (Total Blocking Time)",
      val: formatMs(run.metrics.tbtMs, c),
      rating: getRatingBadge("tbt", run.metrics.tbtMs, c),
      delta: formatMetricDelta(
        run.metrics.tbtMs,
        previousRun?.tbtMs,
        "ms",
        0,
        c,
      ),
    },
    {
      name: "FCP (First Contentful Paint)",
      val: formatMs(run.metrics.fcpMs, c),
      rating: getRatingBadge("fcp", run.metrics.fcpMs, c),
      delta: formatMetricDelta(
        run.metrics.fcpMs,
        previousRun?.fcpMs,
        "ms",
        0,
        c,
      ),
    },
    {
      name: "Speed Index",
      val: formatMs(run.metrics.siMs, c),
      rating: getRatingBadge("si", run.metrics.siMs, c),
      delta: formatMetricDelta(run.metrics.siMs, previousRun?.siMs, "ms", 0, c),
    },
    {
      name: "TTFB (Time to First Byte)",
      val: formatMs(run.metrics.ttfbMs, c),
      rating: getRatingBadge("ttfb", run.metrics.ttfbMs, c),
      delta: formatMetricDelta(
        run.metrics.ttfbMs,
        previousRun?.ttfbMs,
        "ms",
        0,
        c,
      ),
    },
  ];

  for (const r of cwvRows) {
    const namePad = r.name.padEnd(32);
    const valPad = r.val.padStart(10);
    const ratingPad = r.rating;
    lines.push(`  ${namePad} ${valPad}  ${ratingPad} ${r.delta}`);
  }
  lines.push("─".repeat(64));

  // Top Diagnostics
  if (run.summary.insights.length > 0) {
    lines.push(c.bold("Top Performance Insights:"));
    for (const insight of run.summary.insights.slice(0, 3)) {
      const savings = insight.displayValue
        ? c.yellow(`(${insight.displayValue})`)
        : "";
      lines.push(`  • ${c.cyan(insight.title)} ${savings}`);
    }
    lines.push("═".repeat(64));
  }

  return lines.join("\n");
}

/**
 * Formats a list of historical Lighthouse audit runs into a tabular overview.
 *
 * @param runs - List of run records from SQLite.
 * @param options - Optional terminal color configuration.
 * @returns Formatted table or empty notice.
 */
export function formatTerminalList(
  runs: LighthouseRunRow[],
  options: ColorOptions = {},
): string {
  const c = getColors(options);
  if (runs.length === 0) {
    return c.yellow(
      "No audit runs found. Run 'devtools lighthouse <url>' first.",
    );
  }

  const lines: string[] = [];
  lines.push(
    c.bold(
      `\n${"ID".padEnd(10)} ${"Date".padEnd(20)} ${"Form".padEnd(8)} ${"Perf".padEnd(6)} ${"A11y".padEnd(6)} ${"Best".padEnd(6)} ${"SEO".padEnd(6)} ${"LCP".padEnd(10)} ${"CLS".padEnd(8)} URL`,
    ),
  );
  lines.push("─".repeat(95));

  for (const run of runs) {
    const id = run.id.slice(0, 8).padEnd(10);
    const date = new Date(run.createdAt)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ")
      .padEnd(20);
    const form = run.formFactor.padEnd(8);
    const perf = String(run.performanceScore ?? "N/A").padEnd(6);
    const a11y = String(run.accessibilityScore ?? "N/A").padEnd(6);
    const best = String(run.bestPracticesScore ?? "N/A").padEnd(6);
    const seo = String(run.seoScore ?? "N/A").padEnd(6);
    const lcp =
      run.lcpMs !== null
        ? `${Math.round(run.lcpMs)} ms`.padEnd(10)
        : "N/A".padEnd(10);
    const cls =
      run.cls !== null ? run.cls.toFixed(3).padEnd(8) : "N/A".padEnd(8);
    const url = run.url;

    lines.push(
      `${c.cyan(id)} ${date} ${form} ${perf} ${a11y} ${best} ${seo} ${lcp} ${cls} ${url}`,
    );
  }

  return lines.join("\n");
}

/**
 * Formats pairwise comparison between two audit runs into a side-by-side delta table.
 *
 * @param run1 - Baseline run row.
 * @param run2 - Comparison run row.
 * @param insightDiff - Optional status differences between Insight audits and CLS culprits.
 * @param options - Optional terminal color configuration.
 * @returns Formatted delta table string.
 */
export function formatTerminalDiff(
  run1: LighthouseRunRow,
  run2: LighthouseRunRow,
  insightDiff?: {
    resolved: Array<{ id: string; title: string }>;
    regressed: Array<{ id: string; title: string }>;
    clsCulpritDelta: number | null;
  },
  options: ColorOptions = {},
): string {
  const c = getColors(options);
  const lines: string[] = [];

  lines.push("");
  lines.push(c.bold("Lighthouse Pairwise Audit Comparison:"));
  lines.push(
    `  Baseline:   ${c.cyan(run1.id.slice(0, 8))} (${run1.formFactor}) ${run1.url} [${new Date(run1.createdAt).toLocaleString("en-US", { timeZone: "UTC" })}]`,
  );
  lines.push(
    `  Comparison: ${c.cyan(run2.id.slice(0, 8))} (${run2.formFactor}) ${run2.url} [${new Date(run2.createdAt).toLocaleString("en-US", { timeZone: "UTC" })}]`,
  );
  lines.push("═".repeat(68));

  // Category Score Deltas
  lines.push(c.bold("Category Scores:"));
  lines.push(
    `  ${"Category".padEnd(18)} ${"Baseline".padStart(10)} ${"Comparison".padStart(12)} ${"Delta".padStart(12)}`,
  );
  lines.push("─".repeat(68));

  const scoreRows = [
    {
      label: "Performance",
      s1: run1.performanceScore,
      s2: run2.performanceScore,
    },
    {
      label: "Accessibility",
      s1: run1.accessibilityScore,
      s2: run2.accessibilityScore,
    },
    {
      label: "Best Practices",
      s1: run1.bestPracticesScore,
      s2: run2.bestPracticesScore,
    },
    { label: "SEO", s1: run1.seoScore, s2: run2.seoScore },
  ];

  for (const s of scoreRows) {
    const labelPad = s.label.padEnd(18);
    const bPad = String(s.s1 ?? "N/A").padStart(10);
    const cPad = String(s.s2 ?? "N/A").padStart(12);
    const dVal = s.s2 !== null && s.s1 !== null ? s.s2 - s.s1 : null;
    let dPad = c.dim("N/A".padStart(12));
    if (dVal !== null) {
      const sign = dVal > 0 ? `+${dVal}` : `${dVal}`;
      const paddedSign = sign.padStart(12);
      dPad =
        dVal > 0
          ? c.green(paddedSign)
          : dVal < 0
            ? c.red(paddedSign)
            : c.dim(paddedSign);
    }
    lines.push(`  ${labelPad} ${bPad} ${cPad}    ${dPad}`);
  }

  lines.push("─".repeat(68));

  // Core Web Vitals Deltas
  lines.push(c.bold("Core Web Vitals:"));
  lines.push(
    `  ${"Metric".padEnd(18)} ${"Baseline".padStart(10)} ${"Comparison".padStart(12)} ${"Delta".padStart(12)}`,
  );
  lines.push("─".repeat(68));

  const metricRows = [
    { label: "LCP", m1: run1.lcpMs, m2: run2.lcpMs, unit: "ms", digits: 0 },
    { label: "CLS", m1: run1.cls, m2: run2.cls, unit: "", digits: 3 },
    { label: "TBT", m1: run1.tbtMs, m2: run2.tbtMs, unit: "ms", digits: 0 },
    { label: "FCP", m1: run1.fcpMs, m2: run2.fcpMs, unit: "ms", digits: 0 },
    {
      label: "Speed Index",
      m1: run1.siMs,
      m2: run2.siMs,
      unit: "ms",
      digits: 0,
    },
    { label: "TTFB", m1: run1.ttfbMs, m2: run2.ttfbMs, unit: "ms", digits: 0 },
  ];

  for (const m of metricRows) {
    const labelPad = m.label.padEnd(18);
    const bPad =
      m.m1 !== null
        ? m.digits > 0
          ? m.m1.toFixed(m.digits).padStart(10)
          : `${Math.round(m.m1).toLocaleString("en-US")} ${m.unit}`.padStart(10)
        : "N/A".padStart(10);
    const cPad =
      m.m2 !== null
        ? m.digits > 0
          ? m.m2.toFixed(m.digits).padStart(12)
          : `${Math.round(m.m2).toLocaleString("en-US")} ${m.unit}`.padStart(12)
        : "N/A".padStart(12);

    const delta = m.m2 !== null && m.m1 !== null ? m.m2 - m.m1 : null;
    let dPad = c.dim("N/A".padStart(12));
    if (delta !== null) {
      const numStr =
        m.digits > 0
          ? delta > 0
            ? `+${delta.toFixed(m.digits)}`
            : delta.toFixed(m.digits)
          : delta > 0
            ? `+${Math.round(delta).toLocaleString("en-US")} ${m.unit}`
            : `${Math.round(delta).toLocaleString("en-US")} ${m.unit}`;
      const padded = numStr.padStart(12);
      // Lower is better: negative is green!
      dPad =
        delta < 0 ? c.green(padded) : delta > 0 ? c.red(padded) : c.dim(padded);
    }

    lines.push(`  ${labelPad} ${bPad} ${cPad}    ${dPad}`);
  }

  if (
    insightDiff &&
    (insightDiff.resolved.length > 0 ||
      insightDiff.regressed.length > 0 ||
      (insightDiff.clsCulpritDelta !== null &&
        insightDiff.clsCulpritDelta !== 0))
  ) {
    lines.push("─".repeat(68));
    lines.push(c.bold("Insight Audits & Culprits:"));
    if (insightDiff.resolved.length > 0) {
      lines.push(
        `  ${c.green("✔ Resolved:")} ${insightDiff.resolved.map((r) => r.title).join(", ")}`,
      );
    }
    if (insightDiff.regressed.length > 0) {
      lines.push(
        `  ${c.red("✖ Regressed:")} ${insightDiff.regressed.map((r) => r.title).join(", ")}`,
      );
    }
    if (
      insightDiff.clsCulpritDelta !== null &&
      insightDiff.clsCulpritDelta !== 0
    ) {
      const sign =
        insightDiff.clsCulpritDelta > 0
          ? `+${insightDiff.clsCulpritDelta}`
          : `${insightDiff.clsCulpritDelta}`;
      const colored =
        insightDiff.clsCulpritDelta < 0 ? c.green(sign) : c.red(sign);
      lines.push(`  CLS Culprits Delta: ${colored}`);
    }
  }

  lines.push("═".repeat(68));
  return lines.join("\n");
}
