import type { EnvMap } from "@devtools/core";
import type { ShutdownRegistry } from "@devtools/core/node";
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
 * Dependency injection seam for `devtools lighthouse <url>`.
 */
export interface LighthouseAuditCommandDeps {
  runAudit?: (
    options: RunLighthouseAuditOptions,
  ) => Promise<LighthouseAuditExecutionResult>;
  openStore?: (options?: {
    env?: EnvMap;
  }) => Promise<LighthouseStore> | LighthouseStore;
  shutdown?: ShutdownRegistry;
  log?: (chunk: string) => void;
  error?: (chunk: string) => void;
  writeStderr?: (chunk: string) => void;
  exit?: (code?: number) => void;
  isStderrTTY?: boolean;
  isTTY?: boolean;
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
export interface LighthouseListCommandDeps {
  openStore?: (options?: {
    env?: EnvMap;
  }) => Promise<LighthouseStore> | LighthouseStore;
  log?: (chunk: string) => void;
  error?: (chunk: string) => void;
  exit?: (code?: number) => void;
  isStderrTTY?: boolean;
  isTTY?: boolean;
}

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
export interface LighthouseDiffCommandDeps {
  openStore?: (options?: {
    env?: EnvMap;
  }) => Promise<LighthouseStore> | LighthouseStore;
  log?: (chunk: string) => void;
  error?: (chunk: string) => void;
  exit?: (code?: number) => void;
  isStderrTTY?: boolean;
  isTTY?: boolean;
}

/**
 * Options for `devtools lighthouse open [id]`.
 */
export interface LighthouseOpenCommandOptions {
  env?: EnvMap;
}

/**
 * Dependency injection seam for `devtools lighthouse open`.
 */
export interface LighthouseOpenCommandDeps {
  openStore?: (options?: {
    env?: EnvMap;
  }) => Promise<LighthouseStore> | LighthouseStore;
  log?: (chunk: string) => void;
  error?: (chunk: string) => void;
  exit?: (code?: number) => void;
  isStderrTTY?: boolean;
  isStdoutTTY?: boolean;
  isTTY?: boolean;
  spawnOpener?: (path: string) => void | Promise<void>;
  fileExists?: (path: string) => boolean;
  isHeadless?: (
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
    platform?: NodeJS.Platform,
  ) => boolean;
}
