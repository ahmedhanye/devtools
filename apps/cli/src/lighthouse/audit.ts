import type { DevtoolsDb, LighthouseRunRow } from "@devtools/db";
import type {
  LighthouseAuditExecutionResult,
  LighthouseProgressEvent,
  RunLighthouseAuditOptions,
} from "@devtools/lighthouse";
import { getColors } from "../colors";
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
  const pc = getColors();
  const exit = (code = 1) => {
    if (deps?.exit) {
      deps.exit(code);
      return;
    }
    process.exit(code);
  };

  const log = deps?.log ?? console.log;
  const writeStderr =
    deps?.writeStderr ?? ((chunk: string) => process.stderr.write(chunk));

  const runAudit =
    deps?.runLighthouseAudit ??
    (await import("@devtools/lighthouse")).runLighthouseAudit;
  const getDb = deps?.getDb ?? (await import("@devtools/db")).getDb;
  const findPrevious =
    deps?.findPreviousLighthouseRun ??
    (await import("@devtools/lighthouse")).findPreviousLighthouseRun;

  let db: DevtoolsDb | undefined;
  try {
    db = getDb();
  } catch {
    // If DB initialization fails, proceed without DB if possible or let audit throw
  }

  const formFactor = options.formFactor ?? "mobile";
  const throttlingMethod = options.throttlingMethod ?? "simulate";
  const categories = options.categories
    ? (options.categories
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean) as RunLighthouseAuditOptions["categories"])
    : undefined;

  // Validate performance budget rules upfront before launching Chrome
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

  const onProgress = (event: LighthouseProgressEvent) => {
    writeStderr(
      pc.dim(
        `[lighthouse] [${event.stage}] ${event.message}${event.totalRuns && event.totalRuns > 1 ? ` (run ${event.runIndex! + 1}/${event.totalRuns})` : ""}\n`,
      ),
    );
  };

  let auditOutput: LighthouseAuditExecutionResult;
  try {
    const disableSandbox =
      options.disableSandbox ?? (options.sandbox === false ? true : undefined);

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
      db,
      onProgress,
      executor: deps?.executor,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    writeStderr(pc.red(`Error running Lighthouse audit: ${message}\n`));
    exit(1);
    return;
  }

  const { normalized: run, run: record } = auditOutput;

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
    let previousRun: LighthouseRunRow | null = null;
    if (db) {
      try {
        previousRun = findPrevious(db, {
          url: record.url,
          formFactor,
          excludeId: record.id,
        });
      } catch {
        previousRun = null;
      }
    }
    let summary = formatTerminalSummary(run, previousRun);
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
}
