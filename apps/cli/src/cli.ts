import { APP_VERSION, type EnvMap } from "@devtools/core";
import { Command } from "commander";
import pc from "picocolors";
import { registerBrowserCommands } from "./browser";
import {
  type DaemonInstance,
  resolveDaemonConfig,
  startDaemon,
} from "./daemon";
import { findNextAvailablePort, isPortAvailable } from "./port";

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
  exit?: (code?: number) => void;
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
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function promptPortChange(
  targetPort: number,
  nextPort: number,
  deps?: WebCommandDeps,
): Promise<number> {
  const confirm = deps?.confirm ?? (await import("@inquirer/prompts")).confirm;
  try {
    const accepted = await confirm({
      message: `Port ${targetPort} is in use. Would you like to use available port ${nextPort} instead?`,
      default: true,
    });
    if (!accepted) {
      console.error(pc.yellow("Aborted server start."));
      exitProcess(1, deps);
      return nextPort;
    }
    return nextPort;
  } catch (error) {
    console.error(
      pc.red(
        `Error: Interactive port conflict prompt failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    exitProcess(1, deps);
    return nextPort;
  }
}

/**
 * Resolves port conflicts when the target port is already occupied.
 * Prompts interactively for the next available port on TTY sessions or exits with code `1` in non-TTY environments.
 */
async function resolvePortConflict(
  targetPort: number,
  targetHost: string,
  deps?: WebCommandDeps,
): Promise<number> {
  if (!checkInteractive(deps)) {
    console.error(
      pc.red(
        `Port ${targetPort} is already in use. Use --port <port> or set PORT=<port> to specify a different port.`,
      ),
    );
    exitProcess(1, deps);
    return targetPort;
  }

  const findNext =
    (deps && deps.findNextAvailablePort) || findNextAvailablePort;
  const nextPort = findNext(targetPort, targetHost);
  if (!nextPort) {
    console.error(
      pc.red(
        `Port ${targetPort} is in use and no available port was found in range.`,
      ),
    );
    exitProcess(1, deps);
    return targetPort;
  }

  return promptPortChange(targetPort, nextPort, deps);
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
  let config: ReturnType<typeof resolveDaemonConfig>;
  try {
    config = resolveDaemonConfig(options);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(pc.red(message));
    exitProcess(1, deps);
    return undefined;
  }

  let targetPort = config.port;
  const targetHost = config.host;
  const staticDir = config.staticDir;

  if (targetPort !== 0 && !isPortAvailable(targetPort, targetHost)) {
    targetPort = await resolvePortConflict(targetPort, targetHost, deps);
  }

  let instance: DaemonInstance;
  try {
    instance = startDaemon({
      ...options,
      port: targetPort,
      host: targetHost,
      staticDir,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(pc.red(message));
    process.exit(1);
  }

  console.log(
    pc.green(
      `DevTools daemon listening on http://${instance.hostname}:${instance.port}`,
    ),
  );
  console.log(pc.dim(`Serving static assets from ${instance.staticDir}`));
  console.log(
    pc.dim(
      `API health available at http://${instance.hostname}:${instance.port}/api/health`,
    ),
  );

  let shuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(
      pc.yellow(`\nReceived ${signal}. Shutting down DevTools daemon...`),
    );
    await instance.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  return instance;
}

/**
 * Constructs the root Commander CLI program with `web` and `browser` command hierarchies.
 *
 * @returns Configured Commander `Command` instance.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("devtools")
    .description("DevTools Developer CLI")
    .version(APP_VERSION);

  program
    .command("web")
    .description("Start the unified local loopback daemon")
    .option("-p, --port <number>", "Port to bind (default: 4000)", (val) => {
      const parsed = Number.parseInt(val, 10);
      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid port number: "${val}"`);
      }
      return parsed;
    })
    .option("-H, --host <string>", "Host to bind (default: 127.0.0.1)")
    .option("-s, --static-dir <path>", "Static asset directory")
    .action(async (options: WebCommandOptions) => {
      await runWebCommand(options);
    });

  registerBrowserCommands(program);

  return program;
}

/**
 * Parses CLI arguments and dispatches the matched command, displaying help when invoked with no subcommand.
 *
 * @param argv - Process argument vector (`process.argv`).
 */
export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();

  if (argv.length <= 2) {
    program.outputHelp();
    return;
  }

  await program.parseAsync(argv);
}

if (import.meta.main) {
  runCli().catch((err) => {
    console.error(pc.red(String(err)));
    process.exit(1);
  });
}
