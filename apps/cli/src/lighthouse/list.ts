import type { DevtoolsDb } from "@devtools/db";
import pc from "picocolors";
import { formatJson } from "./formatters/json";
import { formatTerminalList } from "./formatters/terminal";
import type {
  LighthouseListCommandDeps,
  LighthouseListCommandOptions,
} from "./types";

/**
 * Executes the `devtools lighthouse list` command, listing recent audit runs from SQLite.
 *
 * @param options - Parsed CLI list options.
 * @param deps - Injected dependencies for hermetic testing.
 */
export async function runLighthouseListCommand(
  options: LighthouseListCommandOptions = {},
  deps?: LighthouseListCommandDeps,
): Promise<void> {
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
  const listRuns =
    deps?.listRuns ?? (await import("@devtools/lighthouse")).listLighthouseRuns;

  let db: DevtoolsDb;
  try {
    db = getDb();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(pc.red(`Error connecting to database: ${message}`));
    exit(1);
    return;
  }

  try {
    const runs = listRuns(db, {
      url: options.url,
      formFactor: options.formFactor,
      limit: options.limit ?? 10,
    });

    if (options.json) {
      log(formatJson(runs));
    } else {
      log(formatTerminalList(runs));
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(pc.red(`Error retrieving audit runs: ${message}`));
    exit(1);
  }
}
