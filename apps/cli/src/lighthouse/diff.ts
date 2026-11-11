import type { LighthouseRunRow } from "@devtools/db";
import {
  computeInsightDiff,
  computeRunDeltas,
  parseRunSummary,
  resolveLighthouseRun,
} from "@devtools/lighthouse";
import {
  connectRequiredLighthouseDb,
  createLighthouseCliContext,
} from "./context";
import { formatJson } from "./formatters/json";
import { formatTerminalDiff } from "./formatters/terminal";
import type {
  LighthouseDiffCommandDeps,
  LighthouseDiffCommandOptions,
} from "./types";

/**
 * Executes the `devtools lighthouse diff <id1> <id2>` command, displaying pairwise
 * score, CWV, and insight differences between two historical audit runs.
 *
 * @param id1 - Baseline run ID or unique prefix.
 * @param id2 - Comparison run ID or unique prefix.
 * @param options - Parsed CLI diff options.
 * @param deps - Injected dependencies for hermetic testing.
 */
export async function runLighthouseDiffCommand(
  id1: string,
  id2: string,
  options: LighthouseDiffCommandOptions = {},
  deps?: LighthouseDiffCommandDeps,
): Promise<void> {
  const ctx = createLighthouseCliContext(options, deps);
  const { pc, log, error, exit } = ctx;

  const db = await connectRequiredLighthouseDb(ctx);
  if (!db) {
    return;
  }

  let run1: LighthouseRunRow;
  let run2: LighthouseRunRow;

  try {
    run1 = resolveLighthouseRun(db, id1);
    run2 = resolveLighthouseRun(db, id2);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(pc.red(`Error resolving audit runs: ${message}`));
    exit(1);
    return;
  }

  if (options.json) {
    const payload = {
      baseline: run1,
      comparison: run2,
      deltas: computeRunDeltas(run1, run2),
    };
    log(formatJson(payload));
  } else {
    const insightDiff = computeInsightDiff(
      parseRunSummary(run1.summaryJson),
      parseRunSummary(run2.summaryJson),
    );
    log(formatTerminalDiff(run1, run2, insightDiff));
  }
}
