import type { EnvMap } from "@devtools/core";
import type { DevtoolsDb } from "@devtools/db";
import { getColors } from "../colors";

/**
 * Shared dependency injection seams across Lighthouse CLI commands (`audit`, `diff`, `list`).
 */
export interface LighthouseCliContextDeps {
  getDb?: (options?: { env?: EnvMap }) => DevtoolsDb;
  log?: (chunk: string) => void;
  error?: (chunk: string) => void;
  writeStderr?: (chunk: string) => void;
  exit?: (code?: number) => void;
  isStderrTTY?: boolean;
  isTTY?: boolean;
}

/**
 * Resolved I/O, colorization, exit, and lazy database helpers for a Lighthouse CLI command.
 */
export interface LighthouseCliContext {
  pc: ReturnType<typeof getColors>;
  log: (chunk: string) => void;
  error: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
  exit: (code?: number) => void;
  getDb: () => Promise<DevtoolsDb>;
}

/**
 * Resolves terminal colorization, output/error streams, exit handler, and lazy DB loader
 * for Lighthouse CLI commands.
 *
 * @param options - Command options carrying optional `env` seam.
 * @param deps - Optional injected dependencies for hermetic testing.
 * @returns Initialized {@link LighthouseCliContext}.
 */
export function createLighthouseCliContext(
  options: { env?: EnvMap } = {},
  deps?: LighthouseCliContextDeps,
): LighthouseCliContext {
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

  return {
    pc,
    log: deps?.log ?? console.log,
    error: deps?.error ?? console.error,
    writeStderr:
      deps?.writeStderr ?? ((chunk: string) => process.stderr.write(chunk)),
    exit,
    getDb: async () =>
      (deps?.getDb ?? (await import("@devtools/db")).getDb)({
        env: options.env,
      }),
  };
}

/**
 * Connects to the SQLite database or prints a formatted connection error and exits with `1`.
 *
 * @param ctx - Active {@link LighthouseCliContext}.
 * @returns Active {@link DevtoolsDb} instance or `null` after exiting on error.
 */
export async function connectRequiredLighthouseDb(
  ctx: LighthouseCliContext,
): Promise<DevtoolsDb | null> {
  try {
    return await ctx.getDb();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.error(ctx.pc.red(`Error connecting to database: ${message}`));
    ctx.exit(1);
    return null;
  }
}
