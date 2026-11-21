import { APP_VERSION, type EnvMap } from "@devtools/core";
import type {
  ExitPort,
  OutputPort,
  SignalSourcePort,
} from "@devtools/core/node";
import type { DbHandle } from "@devtools/db";
import type { LighthouseStore } from "@devtools/lighthouse";
import { Command } from "commander";
import { registerBrowserCommands } from "../commands/browser";
import { registerLighthouseCommands } from "../commands/lighthouse";
import { registerWebCommand } from "../commands/web";

/**
 * Optional composition-root host seams forwarded into registered CLI subcommands.
 */
export interface CreateProgramDeps {
  /** Optional lazy Lighthouse store opener (defaults to dynamic `@devtools/db` + `@devtools/lighthouse` import). */
  openStore?: (options?: {
    env?: EnvMap;
  }) => Promise<LighthouseStore> | LighthouseStore;
  /** Optional callback closing the active composition-root database handle. */
  closeStore?: () => void;
  /** Optional cancellation signal forwarded to short-lived commands (`browser`, `lighthouse`). */
  signal?: AbortSignal;
  /** Optional signal source port forwarded to `web`. */
  signals?: SignalSourcePort;
  /** Optional stdout/stderr port forwarded to `web`. */
  output?: OutputPort;
  /** Optional exit handler forwarded to subcommands. */
  exit?: ExitPort;
  /** Callback invoked by `web` right before attaching daemon signal listeners. */
  onDaemonStarted?: () => void;
}

/**
 * Creates a lazy, dynamically imported SQLite-backed {@link LighthouseStore} controller.
 *
 * Defers importing `@devtools/db` and `@devtools/lighthouse` until a DB-using command
 * executes so DB-free invocations (`--help`, `--version`, `browser status`) pay zero
 * SQLite/Drizzle module parse cost.
 *
 * @returns Lazy `{ openStore, closeStore }` lifecycle pair owned by the CLI composition root.
 */
export function createLazyLighthouseStore(): {
  openStore: (options?: { env?: EnvMap }) => Promise<LighthouseStore>;
  closeStore: () => void;
} {
  let activeDb: DbHandle | null = null;

  const closeStore = (): void => {
    if (activeDb !== null) {
      const handle = activeDb;
      activeDb = null;
      handle.close();
    }
  };

  const openStore = async (options?: {
    env?: EnvMap;
  }): Promise<LighthouseStore> => {
    closeStore();
    const [{ openDb }, { createLighthouseStore }] = await Promise.all([
      import("@devtools/db"),
      import("@devtools/lighthouse"),
    ]);
    const db = openDb({ env: options?.env });
    activeDb = db;
    return createLighthouseStore({ db, env: options?.env });
  };

  return { openStore, closeStore };
}

/**
 * Constructs the root Commander CLI program with `web`, `browser`, and `lighthouse` command hierarchies.
 *
 * @param deps - Optional composition-root host seams for signal, store, and I/O wiring.
 * @returns Configured Commander `Command` instance.
 */
export function createProgram(deps?: CreateProgramDeps): Command {
  const program = new Command();

  program
    .name("devtools")
    .description("DevTools Developer CLI")
    .version(APP_VERSION);

  const fallbackStore = deps?.openStore
    ? undefined
    : createLazyLighthouseStore();

  registerWebCommand(program, {
    signal: deps?.signal,
    signals: deps?.signals,
    output: deps?.output,
    exit: deps?.exit,
    onDaemonStarted: deps?.onDaemonStarted,
  });
  registerBrowserCommands(program, {
    signal: deps?.signal,
    exit: deps?.exit,
  });
  registerLighthouseCommands(program, {
    openStore: deps?.openStore ?? fallbackStore?.openStore,
    closeStore: deps?.closeStore ?? fallbackStore?.closeStore,
    signal: deps?.signal,
    exit: deps?.exit,
  });

  return program;
}
