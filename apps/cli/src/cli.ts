import { APP_VERSION } from "@devtools/core";
import { Command } from "commander";
import pc from "picocolors";
import { registerBrowserCommands } from "./browser";
import { type DaemonInstance, startDaemon } from "./daemon";
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
  confirmFn?: (opts: {
    message: string;
    default?: boolean;
  }) => Promise<boolean>,
): Promise<number> {
  const confirm = confirmFn ?? (await import("@inquirer/prompts")).confirm;
  try {
    const accepted = await confirm({
      message: `Port ${targetPort} is in use. Would you like to use available port ${nextPort} instead?`,
      default: true,
    });
    if (!accepted) {
      console.log(pc.yellow("Aborted server start."));
      process.exit(1);
    }
    return nextPort;
  } catch {
    process.exit(1);
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
    process.exit(1);
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
    process.exit(1);
  }

  return promptPortChange(
    targetPort,
    nextPort,
    deps ? deps.confirm : undefined,
  );
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
  let targetPort =
    options.port !== undefined
      ? options.port
      : process.env.PORT !== undefined
        ? Number.parseInt(process.env.PORT, 10)
        : 4000;

  const targetHost = options.host ?? process.env.HOST ?? "127.0.0.1";
  const staticDir = options.staticDir ?? process.env.DEVTOOLS_STATIC_DIR;

  if (targetPort !== 0 && !isPortAvailable(targetPort, targetHost)) {
    targetPort = await resolvePortConflict(targetPort, targetHost, deps);
  }

  let instance: DaemonInstance;
  try {
    instance = startDaemon({
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
    console.log(
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
