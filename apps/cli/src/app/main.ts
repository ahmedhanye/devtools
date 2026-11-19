import {
  attachHostSignals,
  hostShutdown,
  type ExitPort,
  type OutputPort,
  type SignalSourcePort,
} from "@devtools/core/node";
import { CommanderError } from "commander";
import { getColors } from "../shared/terminal";
import { createProgram } from "./program";

const pc = getColors();

/**
 * Parses CLI arguments and dispatches the matched command, displaying help when invoked with no subcommand.
 *
 * @param argv - Process argument vector (`process.argv`).
 * @param deps - Optional host signal, output, and exit ports for hermetic signal testing.
 */
export async function runCli(
  argv: string[] = process.argv,
  deps?: {
    signals?: SignalSourcePort;
    output?: OutputPort;
    exit?: ExitPort;
  },
): Promise<void> {
  const signalHandle = attachHostSignals({
    coordinator: hostShutdown,
    signals: deps?.signals,
    output: deps?.output,
    exit: deps?.exit,
  });

  try {
    const program = createProgram();
    if (deps?.output) {
      const out = deps.output;
      program.configureOutput({
        writeOut: (str) => out.writeStdout(str.trimEnd()),
        writeErr: (str) => out.writeStderr(str.trimEnd()),
      });
    }
    if (deps?.exit) {
      const exit = deps.exit;
      program.exitOverride((err) => {
        exit(err.exitCode);
        throw err;
      });
    }

    await (argv.length <= 2
      ? Promise.resolve(program.outputHelp())
      : program.parseAsync(argv));
  } catch (err) {
    if (!(err instanceof CommanderError && deps?.exit)) {
      throw err;
    }
  } finally {
    signalHandle.detach();
  }
}

/**
 * Executes the CLI entrypoint when invoked as the main executable script.
 *
 * @param isMain - Whether the current module is running as the primary entrypoint.
 * @param deps - Optional argument vector and I/O/exit seams for hermetic testing.
 */
export function executeCliMain(
  isMain: boolean,
  deps?: {
    argv?: string[];
    signals?: SignalSourcePort;
    output?: OutputPort;
    exit?: ExitPort;
  },
): Promise<void> | undefined {
  if (!isMain) {
    return undefined;
  }
  const output = deps?.output;
  const writeFatal = output
    ? (msg: string) => output.writeStderr(msg)
    : (msg: string) => console.error(msg);
  const exit: ExitPort = deps?.exit ?? ((code) => process.exit(code));
  return runCli(deps?.argv, deps).catch((err) => {
    writeFatal(pc.red(String(err)));
    exit(1);
  });
}

void executeCliMain(import.meta.main);
