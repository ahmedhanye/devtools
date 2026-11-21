import type { LighthouseStore } from "@devtools/lighthouse";
import {
  connectRequiredLighthouseStore,
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

  const store = await connectRequiredLighthouseStore(ctx);
  if (!store) {
    return;
  }

  const executeDiff = (): number | undefined => {
    let diffResult: ReturnType<LighthouseStore["diffRuns"]>;
    try {
      diffResult = store.diffRuns(id1, id2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      error(pc.red(`Error resolving audit runs: ${message}`));
      return 1;
    }

    const { baseline: run1, comparison: run2, deltas } = diffResult;

    if (options.json) {
      log(formatJson({ baseline: run1, comparison: run2, deltas }));
    } else {
      log(formatTerminalDiff(run1, run2, deltas.insights));
    }
    return undefined;
  };

  let exitCode: number | undefined;
  try {
    exitCode = executeDiff();
  } finally {
    ctx.closeStore();
  }

  if (exitCode !== undefined) {
    exit(exitCode);
  }
}
