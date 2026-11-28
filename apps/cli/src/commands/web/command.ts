import type { EnvMap } from "@devtools/core";
import {
  attachHostSignals,
  createConsoleOutput,
  createTeardown,
  type OutputPort,
  type SignalSourcePort,
} from "@devtools/core/node";
import { InvalidArgumentError, type Command } from "commander";
import { getColors, isStreamTTY } from "../../shared/terminal";
import type { DaemonInstance, StartDaemonOptions } from "../../daemon";
import { findNextAvailablePort, isPortAvailable } from "./port";

const pc = getColors();

/**
 * CLI flag options for the `devtools web` command.
 */
export interface WebCommandOptions {
  /** TCP port number to bind (`--port`). */
  port?: number;
  /** Loopback or network hostname to bind (`--host`). */
  host?: string;
  /** Custom pre-rendered static asset directory (`--static-dir`). */
  staticDir?: string;
  /** Optional environment variable map seam for hermetic in-process testing. */
  env?: EnvMap;
}

/**
 * Dependency injection seam for testing port conflict resolution and interactive prompts in {@link runWebCommand}.
 */
export interface WebCommandDeps {
  /** Override interactive TTY check. */
  isInteractive?: () => boolean;
  /** Override interactive confirmation prompt. */
  confirm?: (opts: { message: string; default?: boolean }) => Promise<boolean>;
  /** Override next available port discovery. */
  findNextAvailablePort?: typeof findNextAvailablePort;
  /** Override process exit handler for programmatic and hermetic testing. */
  exit?: (code: number) => void;
  /** Override signal source port (`process` by default). */
  signals?: SignalSourcePort;
  /** Override stdout/stderr output port (`createConsoleOutput()` by default). */
  output?: OutputPort;
  /** Override daemon starter seam for hermetic shutdown failure testing. */
  startDaemon?: (options?: StartDaemonOptions) => DaemonInstance;
  /** Callback invoked right before daemon signal handlers attach (e.g., to detach outer CLI listeners). */
  onDaemonStarted?: () => void;
  /** Optional cancellation signal forwarded from the CLI composition root. */
  signal?: AbortSignal;
}

function exitProcess(code = 1, deps?: WebCommandDeps): void {
  if (deps?.exit) {
    deps.exit(code);
    return;
  }
  process.exit(code);
}

function checkInteractive(deps?: WebCommandDeps): boolean {
  if (deps && deps.isInteractive) {
    return deps.isInteractive();
  }
  return isStreamTTY(process.stdin) && isStreamTTY(process.stdout);
}

function handlePortPromptError(
  error: unknown,
  output: OutputPort,
  deps?: WebCommandDeps,
): null {
  const isPromptCancel =
    deps?.signal?.aborted === true ||
    (error instanceof Error && error.name === "ExitPromptError");
  if (isPromptCancel) {
    if (!deps?.signal?.aborted) {
      exitProcess(130, deps);
    }
    return null;
  }
  output.writeStderr(
    pc.red(
      `Error: Interactive port conflict prompt failed: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
  exitProcess(1, deps);
  return null;
}

async function promptPortChange(
  targetPort: number,
  nextPort: number,
  output: OutputPort,
  deps?: WebCommandDeps,
): Promise<number | null> {
  const confirm = deps?.confirm ?? (await import("@inquirer/prompts")).confirm;
  try {
    const accepted = await confirm({
      message: `Port ${targetPort} is in use. Would you like to use available port ${nextPort} instead?`,
      default: true,
    });
    if (!accepted) {
      output.writeStderr(pc.yellow("Aborted server start."));
      exitProcess(1, deps);
      return null;
    }
    return nextPort;
  } catch (error) {
    return handlePortPromptError(error, output, deps);
  }
}

/**
 * Resolves port conflicts when the target port is already occupied.
 * Prompts interactively for the next available port on TTY sessions or exits with code `1` in non-TTY environments.
 */
async function resolvePortConflict(
  targetPort: number,
  targetHost: string,
  output: OutputPort,
  deps?: WebCommandDeps,
): Promise<number | null> {
  if (!checkInteractive(deps)) {
    output.writeStderr(
      pc.red(
        `Port ${targetPort} is already in use. Use --port <port> or set PORT=<port> to specify a different port.`,
      ),
    );
    exitProcess(1, deps);
    return null;
  }

  const findNext =
    (deps && deps.findNextAvailablePort) || findNextAvailablePort;
  const nextPort = findNext(targetPort, targetHost);
  if (!nextPort) {
    output.writeStderr(
      pc.red(
        `Port ${targetPort} is in use and no available port was found in range.`,
      ),
    );
    exitProcess(1, deps);
    return null;
  }

  return promptPortChange(targetPort, nextPort, output, deps);
}

/**
 * Executes the `devtools web` command, resolving port availability, starting the unified
 * loopback daemon, and registering graceful `SIGINT` / `SIGTERM` shutdown handlers.
 *
 * @param options - Parsed CLI options for port, host, and static asset directory.
 * @param deps - Optional dependency injection seams for testing interactive conflict flows.
 * @returns Running {@link DaemonInstance} when startup succeeds.
 */
export async function runWebCommand(
  options: WebCommandOptions = {},
  deps?: WebCommandDeps,
): Promise<DaemonInstance | undefined> {
  const output = deps?.output ?? createConsoleOutput();
  const { resolveDaemonConfig, startDaemon } = await import("../../daemon");
  let config: ReturnType<typeof resolveDaemonConfig>;
  try {
    config = resolveDaemonConfig(options);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    output.writeStderr(pc.red(message));
    exitProcess(1, deps);
    return undefined;
  }

  let targetPort = config.port;
  const targetHost = config.host;
  const staticDir = config.staticDir;

  if (targetPort !== 0 && !isPortAvailable(targetPort, targetHost)) {
    const resolvedPort = await resolvePortConflict(
      targetPort,
      targetHost,
      output,
      deps,
    );
    if (resolvedPort === null) {
      return undefined;
    }
    targetPort = resolvedPort;
  }

  const teardown = createTeardown();
  const doStartDaemon = deps?.startDaemon ?? startDaemon;

  let instance: DaemonInstance;
  try {
    instance = doStartDaemon({
      ...options,
      port: targetPort,
      host: targetHost,
      staticDir,
      signal: teardown.signal,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    output.writeStderr(pc.red(message));
    exitProcess(1, deps);
    return undefined;
  }

  teardown.defer(() => instance.stop());

  output.writeStdout(
    pc.green(
      `DevTools daemon listening on http://${instance.hostname}:${instance.port}`,
    ),
  );
  output.writeStdout(
    pc.dim(`Serving static assets from ${instance.staticDir}`),
  );
  output.writeStdout(
    pc.dim(
      `API health available at http://${instance.hostname}:${instance.port}/api/health`,
    ),
  );

  deps?.onDaemonStarted?.();

  const signalHandle = attachHostSignals({
    onShutdown: () => teardown.run(),
    signals: deps?.signals,
    output,
    exit: deps?.exit,
    exitCodeOnSignal: 0,
    forceExitOnSecondSignal: true,
    formatFirstSignalMessage: (signal) =>
      pc.yellow(`\nReceived ${signal}. Shutting down DevTools daemon...`),
    formatErrorMessage: (err) =>
      pc.red(
        `Error during daemon shutdown: ${err instanceof Error ? err.message : String(err)}`,
      ),
  });

  return {
    ...instance,
    stop: async () => {
      signalHandle.detach();
      await teardown.run();
    },
  };
}

/**
 * Registers the `devtools web` subcommand on a root Commander program.
 *
 * @param program - Root Commander `Command` instance.
 * @param deps - Optional action handler and host-seam overrides for hermetic testing.
 * @returns Configured `web` subcommand instance.
 */
export function registerWebCommand(
  program: Command,
  deps?: {
    runWebCommand?: typeof runWebCommand;
    signals?: SignalSourcePort;
    output?: OutputPort;
    exit?: (code: number) => void;
    onDaemonStarted?: () => void;
    signal?: AbortSignal;
  },
): Command {
  const doWeb = deps?.runWebCommand ?? runWebCommand;
  const hasHostDeps = Boolean(
    deps?.signals ||
    deps?.output ||
    deps?.exit ||
    deps?.onDaemonStarted ||
    deps?.signal,
  );
  const webDeps: WebCommandDeps | undefined = hasHostDeps
    ? {
        signals: deps?.signals,
        output: deps?.output,
        exit: deps?.exit,
        onDaemonStarted: deps?.onDaemonStarted,
        signal: deps?.signal,
      }
    : undefined;

  return program
    .command("web")
    .description("Start the unified local loopback daemon")
    .option("-p, --port <number>", "Port to bind (default: 4000)", (val) => {
      const trimmed = val.trim();
      if (!/^-?\d+$/.test(trimmed)) {
        throw new InvalidArgumentError(`Invalid port number: "${val}"`);
      }
      return Number.parseInt(trimmed, 10);
    })
    .option("-H, --host <string>", "Host to bind (default: 127.0.0.1)")
    .option("-s, --static-dir <path>", "Static asset directory")
    .action(async (options: WebCommandOptions) => {
      await (webDeps ? doWeb(options, webDeps) : doWeb(options));
    });
}
