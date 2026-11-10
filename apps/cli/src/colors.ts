import pc from "picocolors";

export type TerminalColors = ReturnType<typeof pc.createColors>;

export interface ColorOptions {
  env?: NodeJS.ProcessEnv;
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
export function shouldEnableColor(options: ColorOptions = {}): boolean {
  if (typeof options.colors === "boolean") {
    return options.colors;
  }
  const env = options.env ?? process.env;
  const isTTY = options.isTTY ?? Boolean(process.stdout?.isTTY);

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
