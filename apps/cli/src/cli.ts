import { confirm } from "@inquirer/prompts";
import { Command } from "commander";
import pc from "picocolors";
import { type DaemonInstance, startDaemon } from "./daemon";
import { findNextAvailablePort, isPortAvailable } from "./port";
import pkg from "../../../package.json";

export interface WebCommandOptions {
  port?: number;
  host?: string;
  staticDir?: string;
}

export async function runWebCommand(
  options: WebCommandOptions = {},
): Promise<DaemonInstance | undefined> {
  let targetPort =
    options.port !== undefined
      ? options.port
      : process.env.PORT !== undefined
        ? Number.parseInt(process.env.PORT, 10)
        : 4000;

  const targetHost = options.host ?? process.env.HOST ?? "127.0.0.1";
  const staticDir = options.staticDir ?? process.env.DEVTOOLS_STATIC_DIR;

  // Check for port conflict if binding to a specific non-ephemeral port
  if (targetPort !== 0 && !isPortAvailable(targetPort, targetHost)) {
    const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

    if (isInteractive) {
      const nextPort = findNextAvailablePort(targetPort, targetHost);
      if (!nextPort) {
        console.error(
          pc.red(
            `Port ${targetPort} is in use and no available port was found in range.`,
          ),
        );
        process.exit(1);
      }

      try {
        const accept = await confirm({
          message: `Port ${targetPort} is in use. Would you like to use available port ${nextPort} instead?`,
          default: true,
        });

        if (!accept) {
          console.log(pc.yellow("Aborted server start."));
          process.exit(1);
        }
        targetPort = nextPort;
      } catch {
        process.exit(1);
      }
    } else {
      console.error(
        pc.red(
          `Port ${targetPort} is already in use. Use --port <port> or set PORT=<port> to specify a different port.`,
        ),
      );
      process.exit(1);
    }
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

export function createProgram(): Command {
  const program = new Command();

  program
    .name("devtools")
    .description("DevTools Developer CLI")
    .version(pkg.version);

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

  return program;
}

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
