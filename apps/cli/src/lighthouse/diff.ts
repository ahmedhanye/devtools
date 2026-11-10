import type { DevtoolsDb, LighthouseRunRow } from "@devtools/db";
import {
  computeInsightDiff,
  computeRunDeltas,
  parseRunSummary,
} from "@devtools/lighthouse";
import { getColors } from "../colors";
import { formatJson } from "./formatters/json";
import { formatTerminalDiff } from "./formatters/terminal";
import { resolveRunId } from "./resolvers";
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
  const isStderrTTY =
    deps?.isStderrTTY ?? deps?.isTTY ?? Boolean(process.stderr.isTTY);
  const pc = getColors({
    env: options.env as NodeJS.ProcessEnv,
    isTTY: isStderrTTY,
  });
  const exit = (code = 1) => {
    if (deps?.exit) {
      deps.exit(code);
      return;
    }
    process.exit(code);
  };

  const log = deps?.log ?? console.log;
  const error = deps?.error ?? console.error;
  const getDb = deps?.getDb ?? (await import("@devtools/db")).getDb;

  let db: DevtoolsDb;
  try {
    db = getDb();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(pc.red(`Error connecting to database: ${message}`));
    exit(1);
    return;
  }

  let run1: LighthouseRunRow;
  let run2: LighthouseRunRow;

  try {
    run1 = resolveRunId(db, id1);
    run2 = resolveRunId(db, id2);
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
