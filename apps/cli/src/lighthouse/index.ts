import type { Command } from "commander";
import type {
  LighthouseAuditCommandOptions,
  LighthouseDiffCommandOptions,
  LighthouseListCommandOptions,
  LighthouseOpenCommandOptions,
} from "./types";

export type * from "./types";

/**
 * Injectable action handlers seam for testing Commander argument parsing and command dispatch.
 */
export interface LighthouseCommandHandlers {
  runAudit?: (
    url: string,
    options?: LighthouseAuditCommandOptions,
  ) => Promise<void>;
  runList?: (options: LighthouseListCommandOptions) => Promise<void>;
  runDiff?: (
    id1: string,
    id2: string,
    options: LighthouseDiffCommandOptions,
  ) => Promise<void>;
  runOpen?: (
    id?: string,
    options?: LighthouseOpenCommandOptions,
  ) => Promise<void>;
}

function collectRules(val: string, memo: string[] = []): string[] {
  memo.push(val);
  return memo;
}

/**
 * Registers the `devtools lighthouse` subcommand suite (`<url>`, `list`, `diff`, `open`)
 * on the Commander program using lazy dynamic imports inside action handlers.
 *
 * @param program - Root Commander `Command` instance.
 * @param handlers - Optional action handler overrides for hermetic testing.
 * @returns Configured `lighthouse` subcommand instance.
 */
export function registerLighthouseCommands(
  program: Command,
  handlers: LighthouseCommandHandlers = {},
): Command {
  const lighthouse = program
    .command("lighthouse")
    .description(
      "Execute Lighthouse performance audits and query audit history",
    )
    .argument("[url]", "Target URL to audit (http:// or https://)")
    .option(
      "--agent",
      "Format output for AI coding agents (~500 tokens, zero ANSI)",
    )
    .option("--json", "Emit machine-readable JSON output to stdout")
    .option(
      "-f, --fail-under <rules>",
      "Assert performance budgets (e.g. perf:90,lcp:2500)",
      collectRules,
    )
    .option("-r, --runs <number>", "Number of audit runs to perform", (val) =>
      Number.parseInt(val, 10),
    )
    .option(
      "--form-factor <mobile|desktop>",
      "Device emulation form factor (default: mobile)",
    )
    .option(
      "--throttling-method <simulate|devtools|provided>",
      "Network and CPU throttling method (default: simulate)",
    )
    .option("--chrome-path <path>", "Custom Chromium binary path override")
    .option("--no-sandbox", "Disable Chromium sandboxing")
    .option(
      "--artifacts-dir <dir>",
      "Custom directory to store report artifacts",
    )
    .option(
      "--categories <categories>",
      "Comma-separated list of Lighthouse categories to audit",
    )
    .action(
      async (
        url: string | undefined,
        options: LighthouseAuditCommandOptions,
      ) => {
        if (!url) {
          lighthouse.outputHelp();
          return;
        }
        const runAudit =
          handlers.runAudit ??
          (await import("./audit")).runLighthouseAuditCommand;
        await runAudit(url, options);
      },
    );

  lighthouse
    .command("list")
    .description("List historical Lighthouse audit runs from SQLite")
    .option("-u, --url <url>", "Filter runs by target URL")
    .option(
      "-m, --form-factor <mobile|desktop>",
      "Filter runs by emulation form factor",
    )
    .option(
      "-l, --limit <number>",
      "Maximum number of runs to return (default: 10)",
      (val) => Number.parseInt(val, 10),
    )
    .option("--json", "Output audit records as JSON")
    .action(async (options: LighthouseListCommandOptions, cmd: Command) => {
      const mergedOptions: LighthouseListCommandOptions = {
        ...cmd.parent?.opts(),
        ...options,
      };
      const runList =
        handlers.runList ?? (await import("./list")).runLighthouseListCommand;
      await runList(mergedOptions);
    });

  lighthouse
    .command("diff <id1> <id2>")
    .description(
      "Display score, CWV, and insight deltas between two audit runs",
    )
    .option("--json", "Output pairwise differences as JSON")
    .action(
      async (
        id1: string,
        id2: string,
        options: LighthouseDiffCommandOptions,
        cmd: Command,
      ) => {
        const mergedOptions: LighthouseDiffCommandOptions = {
          ...cmd.parent?.opts(),
          ...options,
        };
        const runDiff =
          handlers.runDiff ?? (await import("./diff")).runLighthouseDiffCommand;
        await runDiff(id1, id2, mergedOptions);
      },
    );

  lighthouse
    .command("open [id]")
    .description(
      "Open the standalone HTML report artifact in the default browser",
    )
    .action(
      async (
        id: string | undefined,
        options: LighthouseOpenCommandOptions,
        cmd: Command,
      ) => {
        const mergedOptions: LighthouseOpenCommandOptions = {
          ...cmd.parent?.opts(),
          ...options,
        };
        const runOpen =
          handlers.runOpen ?? (await import("./open")).runLighthouseOpenCommand;
        await runOpen(id, mergedOptions);
      },
    );

  return lighthouse;
}
