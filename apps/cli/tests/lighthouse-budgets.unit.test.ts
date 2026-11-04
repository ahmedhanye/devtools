import { describe, expect, test } from "bun:test";
import {
  evaluateBudgets,
  formatBudgetEvaluationMarkdown,
  formatBudgetEvaluationTerminal,
  parseBudgetRules,
} from "../src/lighthouse/budgets";
import { InvalidBudgetRuleError } from "../src/lighthouse/errors";

describe("Lighthouse Budgets (Unit)", () => {
  describe("parseBudgetRules", () => {
    test("parses single number shorthand as performance budget", () => {
      const rules = parseBudgetRules("80");
      expect(rules).toEqual([
        {
          key: "performanceScore",
          label: "Performance",
          threshold: 80,
          polarity: "higher-is-better",
        },
      ]);
    });

    test("parses key-value pairs with colon and equals separators", () => {
      const rules = parseBudgetRules("performance:90,accessibility=85");
      expect(rules).toEqual([
        {
          key: "performanceScore",
          label: "Performance",
          threshold: 90,
          polarity: "higher-is-better",
        },
        {
          key: "accessibilityScore",
          label: "Accessibility",
          threshold: 85,
          polarity: "higher-is-better",
        },
      ]);
    });

    test("parses all category aliases", () => {
      const rules = parseBudgetRules(
        "perf:90,a11y:80,best-practices:85,seo:95",
      );
      expect(rules).toHaveLength(4);
      expect(rules[0]?.key).toBe("performanceScore");
      expect(rules[1]?.key).toBe("accessibilityScore");
      expect(rules[2]?.key).toBe("bestPracticesScore");
      expect(rules[3]?.key).toBe("seoScore");
    });

    test("parses alternative best practices alias variants", () => {
      const r1 = parseBudgetRules("best:70");
      const r2 = parseBudgetRules("bestPractices:75");
      const r3 = parseBudgetRules("best_practices:80");
      expect(r1[0]?.key).toBe("bestPracticesScore");
      expect(r2[0]?.key).toBe("bestPracticesScore");
      expect(r3[0]?.key).toBe("bestPracticesScore");
    });

    test("parses Core Web Vitals with lower-is-better polarity", () => {
      const rules = parseBudgetRules(
        "lcp:2500,cls:0.1,tbt:200,fcp:1800,si:3000,ttfb:800",
      );
      expect(rules).toEqual([
        {
          key: "lcpMs",
          label: "LCP",
          threshold: 2500,
          polarity: "lower-is-better",
        },
        {
          key: "cls",
          label: "CLS",
          threshold: 0.1,
          polarity: "lower-is-better",
        },
        {
          key: "tbtMs",
          label: "TBT",
          threshold: 200,
          polarity: "lower-is-better",
        },
        {
          key: "fcpMs",
          label: "FCP",
          threshold: 1800,
          polarity: "lower-is-better",
        },
        {
          key: "siMs",
          label: "Speed Index",
          threshold: 3000,
          polarity: "lower-is-better",
        },
        {
          key: "ttfbMs",
          label: "TTFB",
          threshold: 800,
          polarity: "lower-is-better",
        },
      ]);
    });

    test("parses repeated flags passed as array of strings", () => {
      const rules = parseBudgetRules(["perf:90", "lcp:2500", "cls:0.1"]);
      expect(rules).toHaveLength(3);
      expect(rules[0]?.key).toBe("performanceScore");
      expect(rules[1]?.key).toBe("lcpMs");
      expect(rules[2]?.key).toBe("cls");
    });

    test("handles extra whitespace gracefully", () => {
      const rules = parseBudgetRules("  perf :  88 ,   lcp = 2000  ");
      expect(rules).toHaveLength(2);
      expect(rules[0]?.threshold).toBe(88);
      expect(rules[1]?.threshold).toBe(2000);
    });

    test("returns empty array for empty input", () => {
      expect(parseBudgetRules("")).toEqual([]);
      expect(parseBudgetRules([])).toEqual([]);
      expect(parseBudgetRules("   ")).toEqual([]);
    });

    test("throws descriptive error for invalid rule format", () => {
      expect(() => parseBudgetRules("invalid_format")).toThrow(
        /Invalid budget rule/i,
      );
      expect(() => parseBudgetRules("perf:not-a-number")).toThrow(
        /Invalid budget threshold/i,
      );
    });

    test("throws error for unknown metric key", () => {
      expect(() => parseBudgetRules("unknown_metric:50")).toThrow(
        /Unknown budget metric/i,
      );
    });
  });

  describe("evaluateBudgets", () => {
    const scores = {
      performanceScore: 85,
      accessibilityScore: 92,
      bestPracticesScore: 88,
      seoScore: 96,
    };
    const metrics = {
      lcpMs: 2200,
      cls: 0.05,
      tbtMs: 150,
      fcpMs: 1200,
      siMs: 2100,
      ttfbMs: 300,
    };

    test("returns passed: true when all category and metric rules are met", () => {
      const rules = parseBudgetRules("perf:80,a11y:90,lcp:2500,cls:0.1");
      const result = evaluateBudgets(scores, metrics, rules);
      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
      expect(result.evaluations).toHaveLength(4);
      expect(result.evaluations.every((e) => e.passed)).toBe(true);
    });

    test("fails when a higher-is-better category score is below threshold", () => {
      const rules = parseBudgetRules("perf:90"); // actual is 85
      const result = evaluateBudgets(scores, metrics, rules);
      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]?.key).toBe("performanceScore");
      expect(result.failures[0]?.actual).toBe(85);
      expect(result.failures[0]?.threshold).toBe(90);
    });

    test("fails when a lower-is-better metric exceeds threshold", () => {
      const rules = parseBudgetRules("lcp:2000"); // actual is 2200
      const result = evaluateBudgets(scores, metrics, rules);
      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]?.key).toBe("lcpMs");
      expect(result.failures[0]?.actual).toBe(2200);
      expect(result.failures[0]?.threshold).toBe(2000);
    });

    test("fails when evaluated metric is null", () => {
      const nullMetrics = { ...metrics, lcpMs: null };
      const rules = parseBudgetRules("lcp:2500");
      const result = evaluateBudgets(scores, nullMetrics, rules);
      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]?.actual).toBeNull();
    });

    test("evaluates multiple rules and collects all failures", () => {
      const rules = parseBudgetRules("perf:90,lcp:2000,cls:0.01");
      const result = evaluateBudgets(scores, metrics, rules);
      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(3);
    });
  });

  describe("formatBudgetEvaluationTerminal", () => {
    test("returns empty string when evaluations array is empty", () => {
      const output = formatBudgetEvaluationTerminal({
        passed: true,
        failures: [],
        evaluations: [],
      });
      expect(output).toBe("");
    });

    test("formats passing evaluation table", () => {
      const rules = parseBudgetRules("perf:80,lcp:2500");
      const result = evaluateBudgets(
        {
          performanceScore: 85,
          accessibilityScore: 90,
          bestPracticesScore: 90,
          seoScore: 90,
        },
        {
          lcpMs: 2200,
          cls: 0.05,
          tbtMs: 150,
          fcpMs: 1200,
          siMs: 2000,
          ttfbMs: 200,
        },
        rules,
      );
      const output = formatBudgetEvaluationTerminal(result);
      expect(output).toContain("Performance");
      expect(output).toContain("LCP");
      expect(output).toContain("PASS");
      expect(output).not.toContain("FAIL");
    });

    test("formats failing evaluation table with failure notice", () => {
      const rules = parseBudgetRules("perf:90,lcp:2000");
      const result = evaluateBudgets(
        {
          performanceScore: 85,
          accessibilityScore: 90,
          bestPracticesScore: 90,
          seoScore: 90,
        },
        {
          lcpMs: 2200,
          cls: 0.05,
          tbtMs: 150,
          fcpMs: 1200,
          siMs: 2000,
          ttfbMs: 200,
        },
        rules,
      );
      const output = formatBudgetEvaluationTerminal(result);
      expect(output).toContain("FAIL");
      expect(output).toContain("Performance Budget Assertion Failed");
    });
  });

  describe("formatBudgetEvaluationMarkdown", () => {
    test("returns empty string when evaluations array is empty", () => {
      const output = formatBudgetEvaluationMarkdown({
        passed: true,
        failures: [],
        evaluations: [],
      });
      expect(output).toBe("");
    });

    test("formats passing evaluation markdown table with zero ANSI", () => {
      const rules = parseBudgetRules("perf:80,lcp:2500");
      const result = evaluateBudgets(
        {
          performanceScore: 85,
          accessibilityScore: 90,
          bestPracticesScore: 90,
          seoScore: 90,
        },
        {
          lcpMs: 2200,
          cls: 0.05,
          tbtMs: 150,
          fcpMs: 1200,
          siMs: 2000,
          ttfbMs: 200,
        },
        rules,
      );
      const output = formatBudgetEvaluationMarkdown(result);
      expect(output).toContain("| Metric | Target | Actual | Status |");
      expect(output).toContain("| Performance | >= 80 | 85 | PASS |");
      expect(output).toContain("| LCP | <= 2500 | 2200 | PASS |");
      expect(output).toContain("Performance Budget Passed");
      // oxlint-disable-next-line no-control-regex
      expect(/\u001b\[/.test(output)).toBe(false);
    });

    test("formats failing evaluation markdown table with failure banner", () => {
      const rules = parseBudgetRules("perf:90,lcp:2000");
      const result = evaluateBudgets(
        {
          performanceScore: 85,
          accessibilityScore: 90,
          bestPracticesScore: 90,
          seoScore: 90,
        },
        {
          lcpMs: 2200,
          cls: 0.05,
          tbtMs: 150,
          fcpMs: 1200,
          siMs: 2000,
          ttfbMs: 200,
        },
        rules,
      );
      const output = formatBudgetEvaluationMarkdown(result);
      expect(output).toContain("| Metric | Target | Actual | Status |");
      expect(output).toContain("| Performance | >= 90 | 85 | FAIL |");
      expect(output).toContain("| LCP | <= 2000 | 2200 | FAIL |");
      expect(output).toContain("Performance Budget Failed");
      // oxlint-disable-next-line no-control-regex
      expect(/\u001b\[/.test(output)).toBe(false);
    });
  });

  describe("InvalidBudgetRuleError", () => {
    test("throws InvalidBudgetRuleError on invalid syntax", () => {
      expect(() => parseBudgetRules("invalid-syntax")).toThrow(
        InvalidBudgetRuleError,
      );
    });
  });
});
