import type { LighthouseRunRow } from "@devtools/db";
import type { NormalizedLighthouseRun } from "@devtools/lighthouse";
import pc from "picocolors";

function formatScoreBadge(score: number | null): string {
  if (score === null || score === undefined) return pc.dim("N/A");
  const rounded = Math.round(score);
  if (rounded >= 90) return pc.green(pc.bold(String(rounded)));
  if (rounded >= 50) return pc.yellow(pc.bold(String(rounded)));
  return pc.red(pc.bold(String(rounded)));
}

function formatScoreDelta(
  curr: number | null,
  prev: number | null | undefined,
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
  if (delta > 0) return pc.green(`(+${delta})`);
  if (delta < 0) return pc.red(`(${delta})`);
  return pc.dim("(0)");
}

function formatMetricDelta(
  curr: number | null,
  prev: number | null | undefined,
  unit = "ms",
  digits = 0,
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
  if (isZero) return pc.dim("(0)");

  const formattedNum =
    digits > 0
      ? delta > 0
        ? `+${delta.toFixed(digits)}`
        : delta.toFixed(digits)
      : delta > 0
        ? `+${Math.round(delta).toLocaleString()}`
        : `${Math.round(delta).toLocaleString()}`;

  const str = unit ? `${formattedNum} ${unit}` : formattedNum;
  if (delta < 0) return pc.green(`(${str})`);
  return pc.red(`(${str})`);
}

function formatMs(val: number | null | undefined): string {
  if (val === null || val === undefined) return pc.dim("N/A");
  return `${Math.round(val).toLocaleString()} ms`;
}

function formatFloat(val: number | null | undefined, digits = 3): string {
  if (val === null || val === undefined) return pc.dim("N/A");
  return val.toFixed(digits);
}

function getRatingBadge(
  metric: "lcp" | "cls" | "tbt" | "fcp" | "si" | "ttfb",
  val: number | null | undefined,
): string {
  if (val === null || val === undefined) return pc.dim("N/A");
  let status: "good" | "needs-improvement" | "poor";

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

  if (status === "good") return pc.green("Good");
  if (status === "needs-improvement") return pc.yellow("Needs Improvement");
  return pc.red("Poor");
}

/**
 * Formats a completed Lighthouse audit run into a human-readable terminal table.
 *
 * @param run - Normalized audit result.
 * @param previousRun - Optional previous run row for inline diffing.
 * @returns Color-coded terminal output string.
 */
export function formatTerminalSummary(
  run: NormalizedLighthouseRun,
  previousRun?: LighthouseRunRow | null,
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(
    `${pc.bold("Lighthouse Audit Report:")} ${pc.cyan(run.requestedUrl)}`,
  );
  if (previousRun) {
    lines.push(
      pc.dim(
        `Baseline: Run ${previousRun.id.slice(0, 8)} (${new Date(previousRun.createdAt).toLocaleString()})`,
      ),
    );
  }
  lines.push("═".repeat(64));

  // Category Scores
  const pDelta = formatScoreDelta(
    run.scores.performanceScore,
    previousRun?.performanceScore,
  );
  const aDelta = formatScoreDelta(
    run.scores.accessibilityScore,
    previousRun?.accessibilityScore,
  );
  const bDelta = formatScoreDelta(
    run.scores.bestPracticesScore,
    previousRun?.bestPracticesScore,
  );
  const sDelta = formatScoreDelta(run.scores.seoScore, previousRun?.seoScore);

  lines.push(pc.bold("Category Scores:"));
  lines.push(
    `  Performance:     ${formatScoreBadge(run.scores.performanceScore)} ${pDelta}`,
  );
  lines.push(
    `  Accessibility:   ${formatScoreBadge(run.scores.accessibilityScore)} ${aDelta}`,
  );
  lines.push(
    `  Best Practices:  ${formatScoreBadge(run.scores.bestPracticesScore)} ${bDelta}`,
  );
  lines.push(
    `  SEO:             ${formatScoreBadge(run.scores.seoScore)} ${sDelta}`,
  );
  lines.push("─".repeat(64));

  // Core Web Vitals
  lines.push(pc.bold("Core Web Vitals:"));
  const cwvRows = [
    {
      name: "LCP (Largest Contentful Paint)",
      val: formatMs(run.metrics.lcpMs),
      rating: getRatingBadge("lcp", run.metrics.lcpMs),
      delta: formatMetricDelta(run.metrics.lcpMs, previousRun?.lcpMs, "ms"),
    },
    {
      name: "CLS (Cumulative Layout Shift)",
      val: formatFloat(run.metrics.cls),
      rating: getRatingBadge("cls", run.metrics.cls),
      delta: formatMetricDelta(run.metrics.cls, previousRun?.cls, "", 3),
    },
    {
      name: "TBT (Total Blocking Time)",
      val: formatMs(run.metrics.tbtMs),
      rating: getRatingBadge("tbt", run.metrics.tbtMs),
      delta: formatMetricDelta(run.metrics.tbtMs, previousRun?.tbtMs, "ms"),
    },
    {
      name: "FCP (First Contentful Paint)",
      val: formatMs(run.metrics.fcpMs),
      rating: getRatingBadge("fcp", run.metrics.fcpMs),
      delta: formatMetricDelta(run.metrics.fcpMs, previousRun?.fcpMs, "ms"),
    },
    {
      name: "Speed Index",
      val: formatMs(run.metrics.siMs),
      rating: getRatingBadge("si", run.metrics.siMs),
      delta: formatMetricDelta(run.metrics.siMs, previousRun?.siMs, "ms"),
    },
    {
      name: "TTFB (Time to First Byte)",
      val: formatMs(run.metrics.ttfbMs),
      rating: getRatingBadge("ttfb", run.metrics.ttfbMs),
      delta: formatMetricDelta(run.metrics.ttfbMs, previousRun?.ttfbMs, "ms"),
    },
  ];

  for (const r of cwvRows) {
    const namePad = r.name.padEnd(32);
    const valPad = r.val.padStart(10);
    const ratingPad = r.rating.padEnd(20);
    lines.push(`  ${namePad} ${valPad}  ${ratingPad} ${r.delta}`);
  }
  lines.push("─".repeat(64));

  // Top Diagnostics
  if (run.summary.insights.length > 0) {
    lines.push(pc.bold("Top Performance Insights:"));
    for (const insight of run.summary.insights.slice(0, 3)) {
      const savings = insight.displayValue
        ? pc.yellow(`(${insight.displayValue})`)
        : "";
      lines.push(`  • ${pc.cyan(insight.title)} ${savings}`);
    }
    lines.push("═".repeat(64));
  }

  return lines.join("\n");
}

/**
 * Formats a list of historical Lighthouse audit runs into a tabular overview.
 *
 * @param runs - List of run records from SQLite.
 * @returns Formatted table or empty notice.
 */
export function formatTerminalList(runs: LighthouseRunRow[]): string {
  if (runs.length === 0) {
    return pc.yellow(
      "No audit runs found. Run 'devtools lighthouse <url>' first.",
    );
  }

  const lines: string[] = [];
  lines.push(
    pc.bold(
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
      `${pc.cyan(id)} ${date} ${form} ${perf} ${a11y} ${best} ${seo} ${lcp} ${cls} ${url}`,
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
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(pc.bold("Lighthouse Pairwise Audit Comparison:"));
  lines.push(
    `  Baseline:   ${pc.cyan(run1.id.slice(0, 8))} (${run1.formFactor}) ${run1.url} [${new Date(run1.createdAt).toLocaleString()}]`,
  );
  lines.push(
    `  Comparison: ${pc.cyan(run2.id.slice(0, 8))} (${run2.formFactor}) ${run2.url} [${new Date(run2.createdAt).toLocaleString()}]`,
  );
  lines.push("═".repeat(68));

  // Category Score Deltas
  lines.push(pc.bold("Category Scores:"));
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
    let dPad = "N/A".padStart(12);
    if (dVal !== null) {
      const sign = dVal > 0 ? `+${dVal}` : `${dVal}`;
      const colorSign =
        dVal > 0 ? pc.green(sign) : dVal < 0 ? pc.red(sign) : pc.dim(sign);
      dPad = colorSign;
    }
    lines.push(`  ${labelPad} ${bPad} ${cPad}    ${dPad}`);
  }

  lines.push("─".repeat(68));

  // Core Web Vitals Deltas
  lines.push(pc.bold("Core Web Vitals:"));
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
          : `${Math.round(m.m1).toLocaleString()} ${m.unit}`.padStart(10)
        : "N/A".padStart(10);
    const cPad =
      m.m2 !== null
        ? m.digits > 0
          ? m.m2.toFixed(m.digits).padStart(12)
          : `${Math.round(m.m2).toLocaleString()} ${m.unit}`.padStart(12)
        : "N/A".padStart(12);

    const delta = m.m2 !== null && m.m1 !== null ? m.m2 - m.m1 : null;
    let dPad = "N/A".padStart(12);
    if (delta !== null) {
      const numStr =
        m.digits > 0
          ? delta > 0
            ? `+${delta.toFixed(m.digits)}`
            : delta.toFixed(m.digits)
          : delta > 0
            ? `+${Math.round(delta).toLocaleString()} ${m.unit}`
            : `${Math.round(delta).toLocaleString()} ${m.unit}`;
      // Lower is better: negative is green!
      const colored =
        delta < 0
          ? pc.green(numStr)
          : delta > 0
            ? pc.red(numStr)
            : pc.dim(numStr);
      dPad = colored;
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
    lines.push(pc.bold("Insight Audits & Culprits:"));
    if (insightDiff.resolved.length > 0) {
      lines.push(
        `  ${pc.green("✔ Resolved:")} ${insightDiff.resolved.map((r) => r.title).join(", ")}`,
      );
    }
    if (insightDiff.regressed.length > 0) {
      lines.push(
        `  ${pc.red("✖ Regressed:")} ${insightDiff.regressed.map((r) => r.title).join(", ")}`,
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
        insightDiff.clsCulpritDelta < 0 ? pc.green(sign) : pc.red(sign);
      lines.push(`  CLS Culprits Delta: ${colored}`);
    }
  }

  lines.push("═".repeat(68));
  return lines.join("\n");
}
