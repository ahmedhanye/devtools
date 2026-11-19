import type { EnvMap } from "@devtools/core";
import type { LighthouseStore } from "@devtools/lighthouse";
import { getColors, isStreamTTY } from "../../shared/terminal";

/**
 * Shared dependency injection seams across Lighthouse CLI commands (`audit`, `diff`, `list`, `open`).
 */
export interface LighthouseCliContextDeps {
  openStore?: (options?: {
    env?: EnvMap;
  }) => Promise<LighthouseStore> | LighthouseStore;
  log?: (chunk: string) => void;
  error?: (chunk: string) => void;
  writeStderr?: (chunk: string) => void;
  exit?: (code?: number) => void;
  isStderrTTY?: boolean;
  isStdoutTTY?: boolean;
  isTTY?: boolean;
}

/**
 * Resolved I/O, colorization, exit, and lazy store helpers for a Lighthouse CLI command.
 */
export interface LighthouseCliContext {
  pc: ReturnType<typeof getColors>;
  pcStdout: ReturnType<typeof getColors>;
  log: (chunk: string) => void;
  error: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
  exit: (code?: number) => void;
  openStore: () => Promise<LighthouseStore>;
  closeStore: () => void;
}

/**
 * Resolves terminal colorization, output/error streams, exit handler, and lazy store loader
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
    deps?.isStderrTTY ?? deps?.isTTY ?? isStreamTTY(process.stderr);
  const isStdoutTTY =
    deps?.isStdoutTTY ?? deps?.isTTY ?? isStreamTTY(process.stdout);
  const pc = getColors({
    env: options.env,
    isTTY: isStderrTTY,
  });
  const pcStdout = getColors({
    env: options.env,
    isTTY: isStdoutTTY,
  });
  const exit = (code = 1) => {
    if (deps?.exit) {
      deps.exit(code);
      return;
    }
    process.exit(code);
  };

  let ownedStore: LighthouseStore | null = null;

  return {
    pc,
    pcStdout,
    log: deps?.log ?? console.log,
    error: deps?.error ?? console.error,
    writeStderr:
      deps?.writeStderr ?? ((chunk: string) => process.stderr.write(chunk)),
    exit,
    openStore: async () => {
      if (deps?.openStore) {
        return await deps.openStore({ env: options.env });
      }
      if (!ownedStore) {
        const { openLighthouseStore } = await import("@devtools/lighthouse");
        ownedStore = openLighthouseStore({ env: options.env });
      }
      return ownedStore;
    },
    closeStore: () => {
      if (ownedStore) {
        ownedStore.close();
        ownedStore = null;
      }
    },
  };
}

/**
 * Opens the lazy {@link LighthouseStore} or prints a formatted connection error and exits with `1`.
 *
 * @param ctx - Active {@link LighthouseCliContext}.
 * @returns Active {@link LighthouseStore} instance or `null` after exiting on error.
 */
export async function connectRequiredLighthouseStore(
  ctx: LighthouseCliContext,
): Promise<LighthouseStore | null> {
  try {
    return await ctx.openStore();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.error(ctx.pc.red(`Error connecting to database: ${message}`));
    ctx.exit(1);
    return null;
  }
}
