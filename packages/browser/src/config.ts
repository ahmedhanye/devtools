import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { EnvMap } from "@devtools/core";

/**
 * Dependency injection seam for browser environment, OS platform, and working directory lookups.
 *
 * @remarks
 * Centralizes all external environment reads in `@devtools/browser` so unit tests
 * can simulate Linux, macOS, and Windows environments without mutating `process.env`.
 */
export interface BrowserConfigSeam {
  /** Isolated environment variable dictionary overriding `process.env`. */
  env?: EnvMap;
  /** Callback returning the simulated OS platform (for example, `"linux"`, `"darwin"`, `"win32"`). */
  platform?: () => NodeJS.Platform | string;
  /** Callback returning the simulated current working directory. */
  cwd?: () => string;
}

/**
 * Flexible options wrapper accepted by browser probe utilities to supply a {@link BrowserConfigSeam}.
 */
export interface BrowserSeamOptions {
  /** Explicit {@link BrowserConfigSeam} instance. */
  seam?: BrowserConfigSeam;
  /** Shorthand environment variable dictionary. */
  env?: EnvMap;
  /** Shorthand OS platform string or provider function. */
  platform?: NodeJS.Platform | string | (() => NodeJS.Platform | string);
  /** Shorthand working directory provider function. */
  cwd?: () => string;
}

/**
 * Converts a platform value or function into a normalized provider callback.
 */
function toPlatformProvider(
  rawPlat:
    NodeJS.Platform | string | (() => NodeJS.Platform | string) | undefined,
): (() => NodeJS.Platform | string) | undefined {
  if (typeof rawPlat === "function") {
    return rawPlat;
  }
  if (rawPlat) {
    return () => rawPlat;
  }
  return undefined;
}

/**
 * Extracts the environment dictionary from a flexible seam input object.
 */
function extractSeamEnv(
  input: BrowserSeamOptions | BrowserConfigSeam | EnvMap,
): EnvMap | undefined {
  const hasSeamProps = "env" in input || "platform" in input || "cwd" in input;
  if (!hasSeamProps) {
    return input as EnvMap;
  }
  return typeof input.env === "object" && input.env !== null
    ? (input.env as EnvMap)
    : undefined;
}

/**
 * Normalizes flexible seam inputs (options object, {@link BrowserConfigSeam}, or plain {@link EnvMap})
 * into a canonical {@link BrowserConfigSeam}.
 *
 * @param input - Optional seam options, seam instance, or raw environment map.
 * @param platformOverride - Optional explicit platform string taking precedence over `input.platform`.
 * @returns Normalized {@link BrowserConfigSeam} or `undefined` when no overrides are present.
 */
export function resolveSeam(
  input?: BrowserSeamOptions | BrowserConfigSeam | EnvMap,
  platformOverride?: NodeJS.Platform | string,
): BrowserConfigSeam | undefined {
  if (!input || typeof input !== "object") {
    return platformOverride ? { platform: () => platformOverride } : undefined;
  }
  if (
    "seam" in input &&
    typeof input.seam === "object" &&
    input.seam !== null
  ) {
    return input.seam as BrowserConfigSeam;
  }

  const rawPlat =
    platformOverride ??
    ("platform" in input && typeof input.platform !== "undefined"
      ? input.platform
      : undefined);
  const cwd =
    "cwd" in input && typeof input.cwd === "function"
      ? (input.cwd as () => string)
      : undefined;

  return {
    env: extractSeamEnv(input),
    platform: toPlatformProvider(rawPlat),
    ...(cwd ? { cwd } : {}),
  };
}

/**
 * Resolves the active environment variable map, falling back to `process.env` only when unset.
 *
 * @param seam - Optional {@link BrowserConfigSeam}.
 * @returns Active environment dictionary.
 */
export function resolveEnv(seam?: BrowserConfigSeam): EnvMap {
  return seam?.env ?? process.env;
}

/**
 * Reads and trims a single environment variable from the seam, returning `undefined` when blank.
 */
function resolveTrimmedEnvVar(
  key: string,
  seam?: BrowserConfigSeam,
): string | undefined {
  const val = resolveEnv(seam)[key]?.trim();
  return val && val.length > 0 ? val : undefined;
}

/**
 * Resolves the active operating system platform identifier.
 *
 * @param seam - Optional {@link BrowserConfigSeam}.
 * @returns OS platform string (such as `"linux"`, `"darwin"`, or `"win32"`).
 */
export function resolvePlatform(
  seam?: BrowserConfigSeam,
): NodeJS.Platform | string {
  return seam?.platform ? seam.platform() : platform();
}

/**
 * Resolves the working directory for relative path resolution, honoring `INIT_CWD` when set.
 *
 * @param seam - Optional {@link BrowserConfigSeam}.
 * @returns Absolute working directory path.
 */
export function resolveCwd(seam?: BrowserConfigSeam): string {
  const initCwd = resolveTrimmedEnvVar("INIT_CWD", seam);
  if (initCwd) {
    return initCwd;
  }
  return seam?.cwd ? seam.cwd() : process.cwd();
}

/**
 * Resolves the managed browser cache directory (`~/.devtools/browsers` or `DEVTOOLS_BROWSERS_DIR`).
 *
 * @param explicitDir - Optional explicit directory override passed by the caller.
 * @param seam - Optional {@link BrowserConfigSeam}.
 * @returns Resolved directory path for managed browser installations.
 */
export function resolveManagedCacheDir(
  explicitDir?: string,
  seam?: BrowserConfigSeam,
): string {
  const trimmed =
    typeof explicitDir === "string" ? explicitDir.trim() : undefined;
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  return (
    resolveTrimmedEnvVar("DEVTOOLS_BROWSERS_DIR", seam) ??
    join(homedir(), ".devtools", "browsers")
  );
}

/**
 * Resolves an explicit browser executable path override from environment variables
 * in order of precedence: `DEVTOOLS_CHROME_PATH`, then `CHROME_PATH`.
 *
 * @param seam - Optional {@link BrowserConfigSeam}.
 * @returns Trimmed executable path override, or `undefined` if neither variable is set.
 */
export function resolveChromePathOverride(
  seam?: BrowserConfigSeam,
): string | undefined {
  return (
    resolveTrimmedEnvVar("DEVTOOLS_CHROME_PATH", seam) ??
    resolveTrimmedEnvVar("CHROME_PATH", seam)
  );
}

/**
 * Resolves Windows `ProgramFiles` and `ProgramFiles(x86)` directory locations with standard defaults.
 *
 * @param seam - Optional {@link BrowserConfigSeam}.
 * @returns Object containing `programFiles` and `programFilesX86` base paths.
 */
export function resolveWindowsProgramFiles(seam?: BrowserConfigSeam): {
  programFiles: string;
  programFilesX86: string;
} {
  const currentEnv = resolveEnv(seam);
  return {
    programFiles: currentEnv["PROGRAMFILES"] ?? "C:\\Program Files",
    programFilesX86:
      currentEnv["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
  };
}

/**
 * Resolves the `PLAYWRIGHT_BROWSERS_PATH` override if configured in the environment.
 *
 * @param seam - Optional {@link BrowserConfigSeam}.
 * @returns Trimmed `PLAYWRIGHT_BROWSERS_PATH` value, or `undefined` when unset.
 */
export function resolvePlaywrightCustomPath(
  seam?: BrowserConfigSeam,
): string | undefined {
  return resolveTrimmedEnvVar("PLAYWRIGHT_BROWSERS_PATH", seam);
}

/**
 * Resolves the `LOCALAPPDATA` directory path for Windows environments.
 *
 * @param seam - Optional {@link BrowserConfigSeam}.
 * @returns Trimmed `LOCALAPPDATA` value, or `undefined` when unset.
 */
export function resolveLocalAppData(
  seam?: BrowserConfigSeam,
): string | undefined {
  return resolveTrimmedEnvVar("LOCALAPPDATA", seam);
}

/**
 * Resolves the `XDG_CACHE_HOME` directory path for Unix/Linux environments.
 *
 * @param seam - Optional {@link BrowserConfigSeam}.
 * @returns Trimmed `XDG_CACHE_HOME` value, or `undefined` when unset.
 */
export function resolveXdgCacheHome(
  seam?: BrowserConfigSeam,
): string | undefined {
  return resolveTrimmedEnvVar("XDG_CACHE_HOME", seam);
}

/**
 * Resolves the Puppeteer browser cache directory, honoring `PUPPETEER_CACHE_DIR` when set.
 *
 * @param home - User home directory path used for the default `<home>/.cache/puppeteer` fallback.
 * @param seam - Optional {@link BrowserConfigSeam}.
 * @returns Resolved Puppeteer cache directory path.
 */
export function resolvePuppeteerCacheDir(
  home: string,
  seam?: BrowserConfigSeam,
): string {
  return (
    resolveTrimmedEnvVar("PUPPETEER_CACHE_DIR", seam) ??
    join(home, ".cache", "puppeteer")
  );
}
