import type {
  LighthouseCategoryScores,
  LighthouseCoreWebVitals,
} from "@devtools/lighthouse";
import { type ColorOptions, getColors } from "../colors";
import { InvalidBudgetRuleError } from "./errors";
import type {
  BudgetEvaluationResult,
  BudgetRule,
  BudgetRuleEvaluation,
  EvaluatedMetricKey,
  MetricPolarity,
} from "./types";

interface MetricMeta {
  key: EvaluatedMetricKey;
  label: string;
  polarity: MetricPolarity;
  unit: string;
}

const METRIC_MAP: Record<string, MetricMeta> = {
  performance: {
    key: "performanceScore",
    label: "Performance",
    polarity: "higher-is-better",
    unit: "",
  },
  perf: {
    key: "performanceScore",
    label: "Performance",
    polarity: "higher-is-better",
    unit: "",
  },
  accessibility: {
    key: "accessibilityScore",
    label: "Accessibility",
    polarity: "higher-is-better",
    unit: "",
  },
  a11y: {
    key: "accessibilityScore",
    label: "Accessibility",
    polarity: "higher-is-better",
    unit: "",
  },
  "best-practices": {
    key: "bestPracticesScore",
    label: "Best Practices",
    polarity: "higher-is-better",
    unit: "",
  },
  best_practices: {
    key: "bestPracticesScore",
    label: "Best Practices",
    polarity: "higher-is-better",
    unit: "",
  },
  bestpractices: {
    key: "bestPracticesScore",
    label: "Best Practices",
    polarity: "higher-is-better",
    unit: "",
  },
  best: {
    key: "bestPracticesScore",
    label: "Best Practices",
    polarity: "higher-is-better",
    unit: "",
  },
  seo: {
    key: "seoScore",
    label: "SEO",
    polarity: "higher-is-better",
    unit: "",
  },
  lcp: {
    key: "lcpMs",
    label: "LCP",
    polarity: "lower-is-better",
    unit: "ms",
  },
  lcp_ms: {
    key: "lcpMs",
    label: "LCP",
    polarity: "lower-is-better",
    unit: "ms",
  },
  lcpms: {
    key: "lcpMs",
    label: "LCP",
    polarity: "lower-is-better",
    unit: "ms",
  },
  cls: {
    key: "cls",
    label: "CLS",
    polarity: "lower-is-better",
    unit: "",
  },
  tbt: {
    key: "tbtMs",
    label: "TBT",
    polarity: "lower-is-better",
    unit: "ms",
  },
  tbt_ms: {
    key: "tbtMs",
    label: "TBT",
    polarity: "lower-is-better",
    unit: "ms",
  },
  tbtms: {
    key: "tbtMs",
    label: "TBT",
    polarity: "lower-is-better",
    unit: "ms",
  },
  fcp: {
    key: "fcpMs",
    label: "FCP",
    polarity: "lower-is-better",
    unit: "ms",
  },
  fcp_ms: {
    key: "fcpMs",
    label: "FCP",
    polarity: "lower-is-better",
    unit: "ms",
  },
  fcpms: {
    key: "fcpMs",
    label: "FCP",
    polarity: "lower-is-better",
    unit: "ms",
  },
  si: {
    key: "siMs",
    label: "Speed Index",
    polarity: "lower-is-better",
    unit: "ms",
  },
  si_ms: {
    key: "siMs",
    label: "Speed Index",
    polarity: "lower-is-better",
    unit: "ms",
  },
  sims: {
    key: "siMs",
    label: "Speed Index",
    polarity: "lower-is-better",
    unit: "ms",
  },
  "speed-index": {
    key: "siMs",
    label: "Speed Index",
    polarity: "lower-is-better",
    unit: "ms",
  },
  ttfb: {
    key: "ttfbMs",
    label: "TTFB",
    polarity: "lower-is-better",
    unit: "ms",
  },
  ttfb_ms: {
    key: "ttfbMs",
    label: "TTFB",
    polarity: "lower-is-better",
    unit: "ms",
  },
  ttfbms: {
    key: "ttfbMs",
    label: "TTFB",
    polarity: "lower-is-better",
    unit: "ms",
  },
};

/**
 * Parses `--fail-under` input rules into standardized {@link BudgetRule} objects.
 *
 * @param input - Single rule string, comma-separated rules, or array of rule strings.
 * @returns Parsed list of budget rules.
 * @throws {@link InvalidBudgetRuleError} When rule syntax is invalid, missing a separator, or specifies a non-numeric threshold.
 * @throws {@link InvalidBudgetRuleError} When an unrecognized metric identifier is supplied.
 */
export function parseBudgetRules(input?: string | string[]): BudgetRule[] {
  if (!input) return [];

  const rawList: string[] = Array.isArray(input) ? input : [input];
  const tokens: string[] = [];

  for (const item of rawList) {
    for (const sub of item.split(",")) {
      const trimmed = sub.trim();
      if (trimmed.length > 0) {
        tokens.push(trimmed);
      }
    }
  }

  const rules: BudgetRule[] = [];

  for (const token of tokens) {
    // Single number shorthand: e.g. "80"
    if (/^\d+(?:\.\d+)?$/.test(token)) {
      const threshold = Number.parseFloat(token);
      rules.push({
        key: "performanceScore",
        label: "Performance",
        threshold,
        polarity: "higher-is-better",
      });
      continue;
    }

    // Split on either ':' or '='
    const separatorIdx = token.search(/[:=]/);
    if (separatorIdx === -1) {
      throw new InvalidBudgetRuleError(
        `Invalid budget rule "${token}". Expected format: "<metric>:<threshold>" or "<metric>=<threshold>".`,
      );
    }

    const rawKey = token.slice(0, separatorIdx).trim().toLowerCase();
    const rawVal = token.slice(separatorIdx + 1).trim();

    if (!rawKey || !rawVal || Number.isNaN(Number(rawVal))) {
      throw new InvalidBudgetRuleError(
        `Invalid budget threshold in rule "${token}". Threshold must be a valid number.`,
      );
    }

    const meta = METRIC_MAP[rawKey];
    if (!meta) {
      throw new InvalidBudgetRuleError(
        `Unknown budget metric "${rawKey}" in rule "${token}". Supported: perf, a11y, best, seo, lcp, cls, tbt, fcp, si, ttfb.`,
      );
    }

    const threshold = Number.parseFloat(rawVal);
    rules.push({
      key: meta.key,
      label: meta.label,
      threshold,
      polarity: meta.polarity,
    });
  }

  return rules;
}

/**
 * Evaluates performance budget rules against category scores and Core Web Vitals.
 *
 * @param scores - Category scores from the audit run.
 * @param metrics - Core Web Vitals from the audit run.
 * @param rules - Parsed budget rules to evaluate.
 * @returns Result summary indicating pass/fail status and rule evaluations.
 */
export function evaluateBudgets(
  scores: LighthouseCategoryScores,
  metrics: LighthouseCoreWebVitals,
  rules: BudgetRule[],
): BudgetEvaluationResult {
  const evaluations: BudgetRuleEvaluation[] = [];
  const failures: BudgetRuleEvaluation[] = [];

  for (const rule of rules) {
    let actual: number | null = null;
    if (rule.key in scores) {
      actual = scores[rule.key as keyof LighthouseCategoryScores];
    } else if (rule.key in metrics) {
      actual = metrics[rule.key as keyof LighthouseCoreWebVitals];
    }

    let passed = false;
    if (actual !== null && actual !== undefined) {
      if (rule.polarity === "higher-is-better") {
        passed = actual >= rule.threshold;
      } else {
        passed = actual <= rule.threshold;
      }
    }

    const evaluation: BudgetRuleEvaluation = {
      key: rule.key,
      label: rule.label,
      threshold: rule.threshold,
      actual,
      polarity: rule.polarity,
      passed,
    };

    evaluations.push(evaluation);
    if (!passed) {
      failures.push(evaluation);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    evaluations,
  };
}

/**
 * Formats a terminal-friendly table showing performance budget evaluation results.
 *
 * @param result - Budget evaluation result.
 * @returns Human-readable table string.
 */
export function formatBudgetEvaluationTerminal(
  result: BudgetEvaluationResult,
  options: ColorOptions = {},
): string {
  if (result.evaluations.length === 0) {
    return "";
  }

  const pc = getColors(options);
  const lines: string[] = [];
  lines.push(pc.bold("\nPerformance Budget Evaluation:"));
  lines.push("─".repeat(60));

  for (const item of result.evaluations) {
    const operator = item.polarity === "higher-is-better" ? ">=" : "<=";
    const targetStr = `${operator} ${item.threshold}`;
    const actualStr = item.actual !== null ? String(item.actual) : "null";
    const statusStr = item.passed ? pc.green("PASS") : pc.red("FAIL");

    const labelPad = item.label.padEnd(16);
    const targetPad = targetStr.padEnd(14);
    const actualPad = `Actual: ${actualStr}`.padEnd(18);

    lines.push(`  ${labelPad} ${targetPad} ${actualPad} [${statusStr}]`);
  }

  lines.push("─".repeat(60));

  if (!result.passed) {
    lines.push(
      pc.red(
        pc.bold(
          `✖ Performance Budget Assertion Failed (${result.failures.length} rule${result.failures.length > 1 ? "s" : ""} failed)`,
        ),
      ),
    );
  } else {
    lines.push(
      pc.green(
        pc.bold(
          `✔ All performance budgets passed (${result.evaluations.length} evaluated)`,
        ),
      ),
    );
  }

  return lines.join("\n");
}

/**
 * Formats a clean, zero-ANSI Markdown table showing performance budget evaluation results.
 *
 * @param result - Budget evaluation result.
 * @returns Zero-ANSI GitHub Flavored Markdown table string.
 */
export function formatBudgetEvaluationMarkdown(
  result: BudgetEvaluationResult,
): string {
  if (result.evaluations.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push("| Metric | Target | Actual | Status |");
  lines.push("| :--- | :--- | :--- | :--- |");

  for (const item of result.evaluations) {
    const operator = item.polarity === "higher-is-better" ? ">=" : "<=";
    const targetStr = `${operator} ${item.threshold}`;
    const actualStr = item.actual !== null ? String(item.actual) : "null";
    const statusStr = item.passed ? "PASS" : "FAIL";
    lines.push(
      `| ${item.label} | ${targetStr} | ${actualStr} | ${statusStr} |`,
    );
  }

  lines.push("");
  if (!result.passed) {
    lines.push(
      `> ❌ **Performance Budget Failed**: ${result.failures.length} rule${result.failures.length > 1 ? "s" : ""} failed.`,
    );
  } else {
    lines.push(
      `> ✅ **Performance Budget Passed**: All ${result.evaluations.length} rule${result.evaluations.length > 1 ? "s" : ""} met.`,
    );
  }

  return lines.join("\n");
}
