import type { RunLighthouseAuditOptions } from "@devtools/lighthouse/application";
import type {
  LighthouseAuditExecutionResult,
  LighthouseProgressEvent,
} from "@devtools/lighthouse/contracts";
import {
  evaluateBudgets,
  formatBudgetEvaluationMarkdown,
  formatBudgetEvaluationTerminal,
  parseBudgetRules,
} from "./budgets";
import {
  connectRequiredLighthouseStore,
  createLighthouseCliContext,
} from "./context";
import { formatAgentMarkdown } from "./formatters/agent";
import { formatJson } from "./formatters/json";
import { formatTerminalSummary } from "./formatters/terminal";
import type {
  LighthouseAuditCommandDeps,
  LighthouseAuditCommandOptions,
} from "./types";

function formatAuditOutput(
  auditOutput: LighthouseAuditExecutionResult,
  options: LighthouseAuditCommandOptions,
  formFactor: NonNullable<LighthouseAuditCommandOptions["formFactor"]>,
  budgetResult: ReturnType<typeof evaluateBudgets> | undefined,
): string {
  const { normalized: run, previousRun } = auditOutput;
  if (options.json) {
    return formatJson(budgetResult ? { ...run, budget: budgetResult } : run);
  }
  if (options.agent) {
    const md = formatAgentMarkdown(run, formFactor);
    return budgetResult
      ? `${md}\n\n## Performance Budget\n\n${formatBudgetEvaluationMarkdown(budgetResult)}`
      : md;
  }
  const summary = formatTerminalSummary(run, previousRun ?? null);
  return budgetResult
    ? `${summary}\n${formatBudgetEvaluationTerminal(budgetResult)}`
    : summary;
}

/**
 * Executes the `devtools lighthouse <url>` command, auditing the target URL,
 * evaluating performance budgets, formatting results for terminals or AI agents,
 * and querying historical baseline diffs.
 *
 * @param url - Target URL to audit.
 * @param options - Parsed CLI audit options.
 * @param deps - Injected dependencies and stream overrides for hermetic testing.
 */
export async function runLighthouseAuditCommand(
  url: string,
  options: LighthouseAuditCommandOptions = {},
  deps?: LighthouseAuditCommandDeps,
): Promise<void> {
  const ctx = createLighthouseCliContext(options, deps);
  const { pc, log, writeStderr, exit } = ctx;

  const formFactor = options.formFactor ?? "mobile";
  const throttlingMethod = options.throttlingMethod ?? "simulate";
  const categories = options.categories
    ? (options.categories
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean) as RunLighthouseAuditOptions["categories"])
    : undefined;

  // Validate performance budget rules upfront before opening SQLite or launching Chrome
  let budgetRules: ReturnType<typeof parseBudgetRules> | undefined;
  if (options.failUnder) {
    try {
      budgetRules = parseBudgetRules(options.failUnder);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      writeStderr(pc.red(`Error parsing budget rules: ${message}\n`));
      exit(1);
      return;
    }
  }

  let runAudit = deps?.runAudit;
  if (!runAudit) {
    const store = await connectRequiredLighthouseStore(ctx);
    if (!store) {
      return;
    }
    runAudit = (opts: RunLighthouseAuditOptions) => store.runAudit(opts);
  }

  const auditSignal = options.signal ?? deps?.signal;
  const onProgress = (event: LighthouseProgressEvent) => {
    const runProgress =
      event.totalRuns && event.totalRuns > 1 && event.runIndex !== undefined
        ? ` (run ${event.runIndex + 1}/${event.totalRuns})`
        : "";
    writeStderr(
      pc.dim(`[lighthouse] [${event.stage}] ${event.message}${runProgress}\n`),
    );
  };

  let exitCode: number | undefined;
  try {
    let auditOutput: LighthouseAuditExecutionResult | undefined;
    try {
      const disableSandbox =
        options.disableSandbox ??
        (options.sandbox === false ? true : undefined);

      auditOutput = await runAudit({
        url,
        formFactor,
        throttlingMethod,
        runs: options.runs,
        categories,
        chromePath: options.chromePath,
        disableSandbox,
        artifactsDir: options.artifactsDir,
        env: options.env,
        ...(auditSignal ? { signal: auditSignal } : {}),
        onProgress,
        executor: deps?.executor,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      writeStderr(pc.red(`Error running Lighthouse audit: ${message}\n`));
      if (!auditSignal?.aborted) {
        exitCode = 1;
      }
    }

    if (auditOutput) {
      const budgetResult =
        budgetRules && budgetRules.length > 0
          ? evaluateBudgets(
              auditOutput.normalized.scores,
              auditOutput.normalized.metrics,
              budgetRules,
            )
          : undefined;

      log(formatAuditOutput(auditOutput, options, formFactor, budgetResult));

      if (budgetResult) {
        exitCode = budgetResult.passed ? 0 : 1;
      }
    }
  } finally {
    ctx.closeStore();
  }

  if (exitCode !== undefined) {
    exit(exitCode);
  }
}
