import type { EnvMap } from "@devtools/core";
import pc from "picocolors";

export type TerminalColors = ReturnType<typeof pc.createColors>;

export interface ColorOptions {
  env?: EnvMap;
  isTTY?: boolean;
  colors?: boolean;
}

/**
 * Determines whether ANSI color escape sequences should be enabled for terminal output,
 * obeying the command line interface guidelines:
 * 1. Explicit `colors` option takes precedence.
 * 2. Disabled when `NO_COLOR` is present and non-empty.
 * 3. Enabled when `FORCE_COLOR` is present (and not "0" or "false").
 * 4. Otherwise enabled only when stdout is an interactive TTY and `TERM !== "dumb"`.
 */
export function isStreamTTY(stream: { isTTY?: boolean } | undefined): boolean {
  return stream?.isTTY === true;
}

export function shouldEnableColor(options: ColorOptions = {}): boolean {
  if (typeof options.colors === "boolean") {
    return options.colors;
  }
  const env = options.env ?? process.env;
  const isTTY = options.isTTY ?? isStreamTTY(process.stdout);

  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") {
    return false;
  }

  if (env.FORCE_COLOR !== undefined) {
    return env.FORCE_COLOR !== "0" && env.FORCE_COLOR !== "false";
  }

  return isTTY && env.TERM !== "dumb";
}

/**
 * Returns a `picocolors` formatter instance with ANSI colors enabled or disabled
 * according to the provided {@link ColorOptions}.
 */
export function getColors(options: ColorOptions = {}): TerminalColors {
  return pc.createColors(shouldEnableColor(options));
}

/**
 * Resolves independent stderr and stdout color formatters from TTY overrides and environment seams.
 */
export function createStreamColors(
  env?: EnvMap,
  deps?: {
    isTTY?: boolean;
    isStderrTTY?: boolean;
    isStdoutTTY?: boolean;
  },
): {
  pcStderr: TerminalColors;
  pcStdout: TerminalColors;
  isStderrTTY: boolean;
} {
  const isStderrTTY =
    deps?.isStderrTTY ?? deps?.isTTY ?? isStreamTTY(process.stderr);
  const isStdoutTTY =
    deps?.isStdoutTTY ?? deps?.isTTY ?? isStreamTTY(process.stdout);
  return {
    pcStderr: getColors({ env, isTTY: isStderrTTY }),
    pcStdout: getColors({ env, isTTY: isStdoutTTY }),
    isStderrTTY,
  };
}
