import type { LighthouseRunRow } from "@devtools/db";
import type {
  LighthouseFormFactor,
  NormalizedLighthouseRun,
} from "@devtools/lighthouse";

/**
 * ANSI escape code pattern used as a safety-net filter to guarantee zero terminal codes.
 */
const ANSI_REGEX =
  // oxlint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

function formatMs(val: number | null | undefined): string {
  if (val === null || val === undefined) return "N/A";
  return `${Math.round(val).toLocaleString()} ms`;
}

function formatFloat(val: number | null | undefined, digits = 3): string {
  if (val === null || val === undefined) return "N/A";
  return val.toFixed(digits);
}

function getCwvStatus(
  metric: "lcp" | "cls" | "tbt" | "fcp" | "ttfb",
  val: number | null | undefined,
): "GOOD" | "NEEDS IMPROVEMENT" | "POOR" | "N/A" {
  if (val === null || val === undefined) return "N/A";
  switch (metric) {
    case "lcp":
      return val <= 2500 ? "GOOD" : val <= 4000 ? "NEEDS IMPROVEMENT" : "POOR";
    case "cls":
      return val <= 0.1 ? "GOOD" : val <= 0.25 ? "NEEDS IMPROVEMENT" : "POOR";
    case "tbt":
      return val <= 200 ? "GOOD" : val <= 600 ? "NEEDS IMPROVEMENT" : "POOR";
    case "fcp":
      return val <= 1800 ? "GOOD" : val <= 3000 ? "NEEDS IMPROVEMENT" : "POOR";
    case "ttfb":
      return val <= 800 ? "GOOD" : val <= 1800 ? "NEEDS IMPROVEMENT" : "POOR";
  }
}

/**
 * Formats a Lighthouse audit run into an un-truncated, token-budgeted (~500 tokens)
 * Markdown document tailored specifically for AI coding agents.
 *
 * @param run - Normalized audit result or persisted database row.
 * @param formFactor - Emulation form factor (defaults to "mobile" if unspecified).
 * @returns Clean GitHub Flavored Markdown with zero ANSI escape codes.
 */
export function formatAgentMarkdown(
  run: NormalizedLighthouseRun | LighthouseRunRow,
  formFactor?: LighthouseFormFactor,
): string {
  const isRow = "summaryJson" in run;

  const url = isRow ? run.url : run.requestedUrl;
  const factor = formFactor ?? (isRow ? run.formFactor : "mobile");

  const scores = isRow
    ? {
        performanceScore: run.performanceScore,
        accessibilityScore: run.accessibilityScore,
        bestPracticesScore: run.bestPracticesScore,
        seoScore: run.seoScore,
      }
    : run.scores;

  const metrics = isRow
    ? {
        lcpMs: run.lcpMs,
        cls: run.cls,
        tbtMs: run.tbtMs,
        fcpMs: run.fcpMs,
        siMs: run.siMs,
        ttfbMs: run.ttfbMs,
      }
    : run.metrics;

  const summary = isRow ? run.summaryJson : run.summary;

  const md: string[] = [];

  // Header & Scores
  md.push(`# Lighthouse Audit: ${url} (${factor})`);
  md.push(
    `Scores: Performance: ${scores.performanceScore ?? "N/A"} | Accessibility: ${scores.accessibilityScore ?? "N/A"} | Best Practices: ${scores.bestPracticesScore ?? "N/A"} | SEO: ${scores.seoScore ?? "N/A"}`,
  );
  md.push("");

  // Core Web Vitals
  md.push("## Core Web Vitals");
  md.push("| Metric | Value | Target | Status | Note |");
  md.push("| :--- | :--- | :--- | :--- | :--- |");

  const lcpStatus = getCwvStatus("lcp", metrics.lcpMs);
  const clsStatus = getCwvStatus("cls", metrics.cls);
  const tbtStatus = getCwvStatus("tbt", metrics.tbtMs);
  const fcpStatus = getCwvStatus("fcp", metrics.fcpMs);
  const ttfbStatus = getCwvStatus("ttfb", metrics.ttfbMs);

  md.push(
    `| LCP | ${formatMs(metrics.lcpMs)} | <= 2,500 ms | ${lcpStatus} | ${summary.lcpElement?.selector ? `Element: ${summary.lcpElement.selector}` : "-"} |`,
  );
  md.push(
    `| CLS | ${formatFloat(metrics.cls)} | <= 0.100 | ${clsStatus} | ${summary.clsCulprits[0]?.element.selector ? `Culprit: ${summary.clsCulprits[0].element.selector}` : "-"} |`,
  );
  md.push(
    `| TBT | ${formatMs(metrics.tbtMs)} | <= 200 ms | ${tbtStatus} | - |`,
  );
  md.push(
    `| FCP | ${formatMs(metrics.fcpMs)} | <= 1,800 ms | ${fcpStatus} | - |`,
  );
  md.push(
    `| TTFB | ${formatMs(metrics.ttfbMs)} | <= 800 ms | ${ttfbStatus} | - |`,
  );
  md.push("");

  // Attributed Elements
  const hasAttributions = summary.lcpElement || summary.clsCulprits.length > 0;
  if (hasAttributions) {
    md.push("## High-Priority Element Attributions");

    if (summary.lcpElement) {
      md.push(`- **LCP Element**: \`${summary.lcpElement.selector}\``);
      if (summary.lcpElement.snippet) {
        md.push(`  - Snippet: \`${summary.lcpElement.snippet}\``);
      }
      if (summary.lcpElement.boundingRect) {
        const { width, height, left, top } = summary.lcpElement.boundingRect;
        md.push(`  - Rect: ${width}x${height} at (${left}, ${top})`);
      }
      if (summary.lcpPhases) {
        const {
          timeToFirstByteMs,
          resourceLoadDelayMs,
          resourceLoadDurationMs,
          elementRenderDelayMs,
        } = summary.lcpPhases;
        md.push(
          `  - Phases: TTFB: ${formatMs(timeToFirstByteMs)} | Load Delay: ${formatMs(resourceLoadDelayMs)} | Load Duration: ${formatMs(resourceLoadDurationMs)} | Render Delay: ${formatMs(elementRenderDelayMs)}`,
        );
      }
    }

    if (summary.clsCulprits.length > 0) {
      for (const culprit of summary.clsCulprits.slice(0, 3)) {
        md.push(
          `- **CLS Culprit**: \`${culprit.element.selector}\` (Shift Score: ${culprit.score.toFixed(3)})`,
        );
        if (culprit.element.snippet) {
          md.push(`  - Snippet: \`${culprit.element.snippet}\``);
        }
        if (culprit.element.boundingRect) {
          const { width, height, left, top } = culprit.element.boundingRect;
          md.push(`  - Rect: ${width}x${height} at (${left}, ${top})`);
        }
        if (culprit.causes.length > 0) {
          const causeDesc = culprit.causes.map((c) => c.cause).join("; ");
          md.push(`  - Cause: ${causeDesc}`);
        }
      }
    }

    md.push("");
  }

  // Prioritized Diagnostics
  const sortedInsights = summary.insights.toSorted((a, b) => {
    const sumA = Object.values(a.metricSavings).reduce((x, y) => x + y, 0);
    const sumB = Object.values(b.metricSavings).reduce((x, y) => x + y, 0);
    return sumB - sumA;
  });

  const hasDiagnostics =
    sortedInsights.length > 0 || summary.failedAudits.length > 0;
  if (hasDiagnostics) {
    md.push("## Prioritized Diagnostics & Action Items");
    let itemIdx = 1;

    for (const insight of sortedInsights.slice(0, 5)) {
      const savingsStr = insight.displayValue ?? "";
      const savingsInfo = savingsStr ? ` (${savingsStr})` : "";
      md.push(
        `${itemIdx++}. **${insight.title}** (\`${insight.id}\`)${savingsInfo}`,
      );
      if (insight.description) {
        // Take first sentence of description to conserve tokens
        const firstSentence =
          insight.description.split(/\.\s+/)[0]?.trim() || insight.description;
        md.push(`   - ${firstSentence}.`);
      }
    }

    for (const audit of summary.failedAudits.slice(0, 3)) {
      const cat = audit.category ? ` [${audit.category}]` : "";
      md.push(`${itemIdx++}. **${audit.title}** (\`${audit.id}\`)${cat}`);
      if (audit.description) {
        const firstSentence =
          audit.description.split(/\.\s+/)[0]?.trim() || audit.description;
        md.push(`   - ${firstSentence}.`);
      }
    }
    md.push("");
  }

  return stripAnsi(md.join("\n"));
}
