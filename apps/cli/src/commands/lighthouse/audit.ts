import { hostShutdown } from "@devtools/core/node";
import type {
  LighthouseAuditExecutionResult,
  LighthouseProgressEvent,
  RunLighthouseAuditOptions,
} from "@devtools/lighthouse";
import {
  connectRequiredLighthouseStore,
  createLighthouseCliContext,
} from "./context";
import {
  evaluateBudgets,
  formatBudgetEvaluationMarkdown,
  formatBudgetEvaluationTerminal,
  parseBudgetRules,
} from "./budgets";
import { formatAgentMarkdown } from "./formatters/agent";
import { formatJson } from "./formatters/json";
import { formatTerminalSummary } from "./formatters/terminal";
import type {
  LighthouseAuditCommandDeps,
  LighthouseAuditCommandOptions,
} from "./types";

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

  try {
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

    const onProgress = (event: LighthouseProgressEvent) => {
      const runProgress =
        event.totalRuns && event.totalRuns > 1 && event.runIndex !== undefined
          ? ` (run ${event.runIndex + 1}/${event.totalRuns})`
          : "";
      writeStderr(
        pc.dim(
          `[lighthouse] [${event.stage}] ${event.message}${runProgress}\n`,
        ),
      );
    };

    const shutdown = deps?.shutdown ?? hostShutdown;
    let auditOutput: LighthouseAuditExecutionResult;
    let pendingAudit: Promise<LighthouseAuditExecutionResult> | undefined;
    const disposeWorkHook = shutdown.register(
      "work",
      async () => {
        await pendingAudit?.catch(() => {});
      },
      { id: "cli-lighthouse-audit-work" },
    );

    try {
      const disableSandbox =
        options.disableSandbox ??
        (options.sandbox === false ? true : undefined);

      pendingAudit = runAudit({
        url,
        formFactor,
        throttlingMethod,
        runs: options.runs,
        categories,
        chromePath: options.chromePath,
        disableSandbox,
        artifactsDir: options.artifactsDir,
        env: options.env,
        signal: options.signal ?? shutdown.signal,
        onProgress,
        executor: deps?.executor,
      });
      auditOutput = await pendingAudit;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      writeStderr(pc.red(`Error running Lighthouse audit: ${message}\n`));
      if (shutdown.isShuttingDown) {
        return;
      }
      exit(1);
      return;
    } finally {
      disposeWorkHook();
    }

    const { normalized: run, previousRun } = auditOutput;

    // Evaluate pre-validated budget rules
    let budgetResult: ReturnType<typeof evaluateBudgets> | undefined;
    if (budgetRules && budgetRules.length > 0) {
      budgetResult = evaluateBudgets(run.scores, run.metrics, budgetRules);
    }

    // Format and emit output to stdout
    if (options.json) {
      const payload = budgetResult ? { ...run, budget: budgetResult } : run;
      log(formatJson(payload));
    } else if (options.agent) {
      let md = formatAgentMarkdown(run, formFactor);
      if (budgetResult) {
        md += `\n\n## Performance Budget\n\n${formatBudgetEvaluationMarkdown(budgetResult)}`;
      }
      log(md);
    } else {
      let summary = formatTerminalSummary(run, previousRun ?? null);
      if (budgetResult) {
        summary += `\n${formatBudgetEvaluationTerminal(budgetResult)}`;
      }
      log(summary);
    }

    // Enforce budget exit code
    if (budgetResult) {
      if (!budgetResult.passed) {
        exit(1);
        return;
      }
      exit(0);
      return;
    }
  } finally {
    ctx.closeStore();
  }
}
