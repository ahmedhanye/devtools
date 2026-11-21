import type { EnvMap } from "@devtools/core";
import type {
  LighthouseAuditExecutionResult,
  LighthouseFormFactor,
  LighthouseIterationExecutor,
  LighthouseStore,
  LighthouseThrottlingMethod,
  RunLighthouseAuditOptions,
} from "@devtools/lighthouse";

/**
 * Metric polarity determining whether higher or lower values represent improvement.
 */
export type MetricPolarity = "higher-is-better" | "lower-is-better";

/**
 * Standardized metric and category keys evaluated in performance budgets.
 */
export type EvaluatedMetricKey =
  | "performanceScore"
  | "accessibilityScore"
  | "bestPracticesScore"
  | "seoScore"
  | "lcpMs"
  | "cls"
  | "tbtMs"
  | "fcpMs"
  | "siMs"
  | "ttfbMs";

/**
 * Parsed rule item for `--fail-under`.
 */
export interface BudgetRule {
  key: EvaluatedMetricKey;
  label: string;
  threshold: number;
  polarity: MetricPolarity;
}

/**
 * Evaluation record for a single performance budget rule.
 */
export interface BudgetRuleEvaluation {
  key: EvaluatedMetricKey;
  label: string;
  threshold: number;
  actual: number | null;
  polarity: MetricPolarity;
  passed: boolean;
}

/**
 * Aggregate result of performance budget evaluation.
 */
export interface BudgetEvaluationResult {
  passed: boolean;
  failures: BudgetRuleEvaluation[];
  evaluations: BudgetRuleEvaluation[];
}

/**
 * Options for `devtools lighthouse <url>`.
 */
export interface LighthouseAuditCommandOptions {
  agent?: boolean;
  json?: boolean;
  failUnder?: string | string[];
  runs?: number;
  formFactor?: LighthouseFormFactor;
  throttlingMethod?: LighthouseThrottlingMethod;
  chromePath?: string;
  sandbox?: boolean;
  disableSandbox?: boolean;
  artifactsDir?: string;
  categories?: string;
  env?: EnvMap;
  signal?: AbortSignal;
}

/**
 * Shared dependency injection seams across Lighthouse CLI commands (`audit`, `diff`, `list`, `open`).
 */
export interface LighthouseCliContextDeps {
  openStore?: (options?: {
    env?: EnvMap;
  }) => Promise<LighthouseStore> | LighthouseStore;
  closeStore?: () => void;
  log?: (chunk: string) => void;
  error?: (chunk: string) => void;
  writeStderr?: (chunk: string) => void;
  exit?: (code: number) => void;
  isStderrTTY?: boolean;
  isStdoutTTY?: boolean;
  isTTY?: boolean;
}

/**
 * Dependency injection seam for `devtools lighthouse <url>`.
 */
export interface LighthouseAuditCommandDeps extends LighthouseCliContextDeps {
  runAudit?: (
    options: RunLighthouseAuditOptions,
  ) => Promise<LighthouseAuditExecutionResult>;
  signal?: AbortSignal;
  executor?: LighthouseIterationExecutor;
}

/**
 * Options for `devtools lighthouse list`.
 */
export interface LighthouseListCommandOptions {
  url?: string;
  formFactor?: LighthouseFormFactor;
  limit?: number;
  json?: boolean;
  env?: EnvMap;
}

/**
 * Dependency injection seam for `devtools lighthouse list`.
 */
export type LighthouseListCommandDeps = LighthouseCliContextDeps;

/**
 * Options for `devtools lighthouse diff <id1> <id2>`.
 */
export interface LighthouseDiffCommandOptions {
  json?: boolean;
  env?: EnvMap;
}

/**
 * Dependency injection seam for `devtools lighthouse diff`.
 */
export type LighthouseDiffCommandDeps = LighthouseCliContextDeps;

/**
 * Options for `devtools lighthouse open [id]`.
 */
export interface LighthouseOpenCommandOptions {
  env?: EnvMap;
}

/**
 * Dependency injection seam for `devtools lighthouse open`.
 */
export interface LighthouseOpenCommandDeps extends LighthouseCliContextDeps {
  spawnOpener?: (path: string) => void | Promise<void>;
  fileExists?: (path: string) => boolean;
  isHeadless?: (
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
    platform?: NodeJS.Platform,
  ) => boolean;
}
