import { homedir, platform } from "node:os";
import { join } from "node:path";

export interface BrowserConfigSeam {
  env?: Record<string, string | undefined>;
  platform?: () => NodeJS.Platform | string;
  cwd?: () => string;
}

export interface BrowserSeamOptions {
  seam?: BrowserConfigSeam;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform | string | (() => NodeJS.Platform | string);
  cwd?: () => string;
}

/**
 * Standardizes flexible seam inputs (options object, seam interface, or plain env map)
 * into a canonical BrowserConfigSeam.
 */
export function resolveSeam(
  input?:
    BrowserSeamOptions | BrowserConfigSeam | Record<string, string | undefined>,
  platformOverride?: NodeJS.Platform | string,
): BrowserConfigSeam | undefined {
  if (!input) {
    return platformOverride ? { platform: () => platformOverride } : undefined;
  }
  if (typeof input !== "object") {
    return undefined;
  }
  if (
    "seam" in input &&
    typeof input.seam === "object" &&
    input.seam !== null
  ) {
    return input.seam as BrowserConfigSeam;
  }
  if (
    "platform" in input &&
    typeof input.platform === "function" &&
    !("env" in input) &&
    !("cwd" in input)
  ) {
    return input as BrowserConfigSeam;
  }
  const hasSeamProps = "env" in input || "platform" in input || "cwd" in input;
  const env = hasSeamProps
    ? typeof input.env === "object" && input.env !== null
      ? (input.env as Record<string, string | undefined>)
      : undefined
    : (input as Record<string, string | undefined>);
  const rawPlat =
    platformOverride ??
    ("platform" in input && typeof input.platform !== "undefined"
      ? input.platform
      : undefined);
  const plat =
    typeof rawPlat === "function"
      ? (rawPlat as () => NodeJS.Platform | string)
      : rawPlat
        ? () => rawPlat as NodeJS.Platform | string
        : undefined;
  const cwd =
    "cwd" in input && typeof input.cwd === "function"
      ? (input.cwd as () => string)
      : undefined;
  return {
    env,
    platform: plat,
    ...(cwd ? { cwd } : {}),
  };
}

/**
 * Resolves the active environment variables, falling back to process.env only when unset.
 */
export function resolveEnv(
  seam?: BrowserConfigSeam,
): Record<string, string | undefined> {
  return seam?.env ?? process.env;
}

/**
 * Resolves the operating system platform.
 */
export function resolvePlatform(
  seam?: BrowserConfigSeam,
): NodeJS.Platform | string {
  return seam?.platform ? seam.platform() : platform();
}

/**
 * Resolves the working directory for relative path resolution, honoring INIT_CWD.
 */
export function resolveCwd(seam?: BrowserConfigSeam): string {
  const currentEnv = resolveEnv(seam);
  const initCwd = currentEnv.INIT_CWD?.trim();
  if (initCwd && initCwd.length > 0) {
    return initCwd;
  }
  return seam?.cwd ? seam.cwd() : process.cwd();
}

/**
 * Resolves the managed browser cache directory (~/.devtools/browsers or DEVTOOLS_BROWSERS_DIR).
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
  const currentEnv = resolveEnv(seam);
  const override = currentEnv.DEVTOOLS_BROWSERS_DIR?.trim();
  return override && override.length > 0
    ? override
    : join(homedir(), ".devtools", "browsers");
}

/**
 * Resolves Chrome path override from environment variables in order of precedence:
 * DEVTOOLS_CHROME_PATH, then CHROME_PATH.
 */
export function resolveChromePathOverride(
  seam?: BrowserConfigSeam,
): string | undefined {
  const currentEnv = resolveEnv(seam);
  const candidates = [currentEnv.DEVTOOLS_CHROME_PATH, currentEnv.CHROME_PATH];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

/**
 * Resolves Windows ProgramFiles directory locations with standard defaults.
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
 * Resolves PLAYWRIGHT_BROWSERS_PATH override if configured.
 */
export function resolvePlaywrightCustomPath(
  seam?: BrowserConfigSeam,
): string | undefined {
  const currentEnv = resolveEnv(seam);
  const val = currentEnv.PLAYWRIGHT_BROWSERS_PATH?.trim();
  return val && val.length > 0 ? val : undefined;
}

/**
 * Resolves LOCALAPPDATA directory for Windows environments.
 */
export function resolveLocalAppData(
  seam?: BrowserConfigSeam,
): string | undefined {
  const currentEnv = resolveEnv(seam);
  const val = currentEnv.LOCALAPPDATA?.trim();
  return val && val.length > 0 ? val : undefined;
}

/**
 * Resolves XDG_CACHE_HOME directory for Unix/Linux environments.
 */
export function resolveXdgCacheHome(
  seam?: BrowserConfigSeam,
): string | undefined {
  const currentEnv = resolveEnv(seam);
  const val = currentEnv.XDG_CACHE_HOME?.trim();
  return val && val.length > 0 ? val : undefined;
}

/**
 * Resolves Puppeteer cache directory, honoring PUPPETEER_CACHE_DIR override.
 */
export function resolvePuppeteerCacheDir(
  home: string,
  seam?: BrowserConfigSeam,
): string {
  const currentEnv = resolveEnv(seam);
  const override = currentEnv.PUPPETEER_CACHE_DIR?.trim();
  if (override && override.length > 0) {
    return override;
  }
  return join(home, ".cache", "puppeteer");
}
