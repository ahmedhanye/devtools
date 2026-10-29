import {
  accessSync,
  constants,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import { dirname, join, resolve as pathResolve } from "node:path";
import type { EnvMap } from "@devtools/core";
import { getInstalledBrowsers } from "@puppeteer/browsers";
import type { InstalledBrowser } from "./types";
import * as chromeLauncher from "chrome-launcher";
import {
  resolveCwd,
  resolveLocalAppData,
  resolveManagedCacheDir,
  resolvePlatform,
  resolvePlaywrightCustomPath,
  resolvePuppeteerCacheDir,
  resolveSeam,
  resolveWindowsProgramFiles,
  resolveXdgCacheHome,
  type BrowserConfigSeam,
  type BrowserSeamOptions,
} from "./config";

/**
 * Outcome of probing a candidate browser executable via `--version` (or PowerShell version metadata on Windows).
 */
export interface VerificationResult {
  /** Whether the file exists, has executable permissions, and exited with code `0` within the timeout. */
  valid: boolean;
  /** First line of version output when `valid` is `true`. */
  version?: string;
}

/**
 * Unverified candidate browser path paired with its discovery source tier.
 */
export interface CandidateBrowser<TSource extends string = string> {
  /** Absolute filesystem path to the candidate binary. */
  path: string;
  /** Discovery source identifier (`"edge"`, `"brave"`, `"playwright"`, `"puppeteer"`, etc.). */
  source: TSource;
}

const PLAYWRIGHT_RELATIVE_BINARY_PATHS: ReadonlyArray<readonly string[]> = [
  ["chrome-linux", "chrome"],
  ["chrome-linux", "headless_shell"],
  ["chrome-linux64", "chrome"],
  ["chrome-headless-shell-linux64", "chrome-headless-shell"],
  ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
  [
    "chrome-mac",
    "Google Chrome for Testing.app",
    "Contents",
    "MacOS",
    "Google Chrome for Testing",
  ],
  ["chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"],
  [
    "chrome-mac-arm64",
    "Google Chrome for Testing.app",
    "Contents",
    "MacOS",
    "Google Chrome for Testing",
  ],
  ["chrome-headless-shell-mac", "chrome-headless-shell"],
  ["chrome-headless-shell-mac-arm64", "chrome-headless-shell"],
  ["chrome-win", "chrome.exe"],
  ["chrome-win64", "chrome.exe"],
  ["chrome-headless-shell-win64", "chrome-headless-shell.exe"],
];

/**
 * Synchronously checks whether a filesystem path exists, is a regular file, and has executable permissions.
 */
function isExecutable(filePath: string): boolean {
  try {
    if (!existsSync(filePath)) return false;
    const stat = statSync(filePath);
    if (!stat.isFile()) return false;
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the command vector used to query a candidate browser's version string.
 *
 * @param executablePath - Filesystem path to the candidate browser binary.
 * @param platformName - Optional OS platform override (`"linux"`, `"darwin"`, `"win32"`). Defaults to `platform()`.
 * @returns Command array vector for execution.
 */
export function buildVersionCommand(
  executablePath: string,
  platformName: string = platform(),
): string[] {
  const isWin = platformName === "win32";
  const lowerPath = executablePath.toLowerCase();
  const isWindowsGuiBinary =
    isWin && lowerPath.endsWith(".exe") && !lowerPath.includes("headless");

  if (isWindowsGuiBinary) {
    const escapedPath = executablePath.replace(/'/g, "''");
    return [
      "powershell",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-Item -LiteralPath '${escapedPath}').VersionInfo.ProductVersion`,
    ];
  }
  return [executablePath, "--version"];
}

/**
 * Safely kills a spawned subprocess without throwing if it already exited.
 */
function safeKillProcess(proc?: ReturnType<typeof Bun.spawn>): void {
  try {
    proc?.kill();
  } catch {
    // Ignore kill errors on exited processes
  }
}

/**
 * Verifies that a browser binary exists, is executable, and responds to a version probe within `timeoutMs`.
 *
 * @param executablePath - Filesystem path to the candidate browser binary.
 * @param timeoutMs - Maximum execution duration in milliseconds before killing the probe process. Defaults to `3000`.
 * @returns {@link VerificationResult} indicating validity and the parsed version string.
 */
export async function verifyBrowserExecutable(
  executablePath: string,
  timeoutMs = 3000,
  spawnFn: typeof Bun.spawn = Bun.spawn,
): Promise<VerificationResult> {
  if (!isExecutable(executablePath)) {
    return { valid: false };
  }

  let proc: ReturnType<typeof Bun.spawn> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const { code, stdout } = await new Promise<{
      code: number;
      stdout: string;
    }>((resolve, reject) => {
      try {
        proc = spawnFn(buildVersionCommand(executablePath), {
          stdout: "pipe",
          stderr: "ignore",
        });

        timer = setTimeout(() => {
          safeKillProcess(proc);
          resolve({ code: -1, stdout: "" });
        }, timeoutMs);

        const stdoutPromise =
          proc.stdout && typeof proc.stdout !== "number"
            ? new Response(proc.stdout).text()
            : Promise.resolve("");

        Promise.all([proc.exited, stdoutPromise])
          .then(([exitCode, text]) => {
            if (timer) clearTimeout(timer);
            resolve({ code: exitCode, stdout: text });
            return undefined;
          })
          .catch((err) => {
            if (timer) clearTimeout(timer);
            reject(err);
          });
      } catch (err) {
        if (timer) clearTimeout(timer);
        reject(err);
      }
    });

    const trimmed = stdout.trim();
    if (code === 0 && trimmed.length > 0) {
      return { valid: true, version: trimmed.split("\n")[0]?.trim() ?? "" };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  } finally {
    if (timer) clearTimeout(timer);
    safeKillProcess(proc);
  }
}

/**
 * Accepted configuration seam inputs for {@link getManagedCacheDir} and {@link probeManagedCache}.
 */
export type ManagedCacheDirOptions =
  | (BrowserSeamOptions & {
      getInstalledBrowsers?: (opts: {
        cacheDir: string;
      }) => Promise<InstalledBrowser[]>;
    })
  | (BrowserConfigSeam & {
      getInstalledBrowsers?: (opts: {
        cacheDir: string;
      }) => Promise<InstalledBrowser[]>;
    })
  | EnvMap;

/**
 * Returns the managed browser cache directory path (`~/.devtools/browsers` or `DEVTOOLS_BROWSERS_DIR`).
 *
 * @param envOrSeam - Optional environment map or {@link BrowserConfigSeam} override.
 * @returns Absolute path to the managed browser cache directory.
 */
export function getManagedCacheDir(envOrSeam?: ManagedCacheDirOptions): string {
  const seam = resolveSeam(envOrSeam);
  return resolveManagedCacheDir(undefined, seam);
}

/**
 * Probes the DevTools managed browser cache for a verified Chromium-compatible binary.
 *
 * @param cacheDir - Optional custom managed cache directory override.
 * @param envOrSeam - Optional environment map or {@link BrowserConfigSeam}.
 * @param timeoutMs - Optional verification timeout in milliseconds per candidate.
 * @returns Object containing `path` and `version` of the first runnable cached browser, or `null` if none is found.
 */
export async function probeManagedCache(
  cacheDir?: string,
  envOrSeam?: ManagedCacheDirOptions,
  timeoutMs?: number,
): Promise<{ path: string; version: string } | null> {
  const seam = resolveSeam(envOrSeam);
  const targetDir = resolveManagedCacheDir(cacheDir, seam);
  if (!existsSync(targetDir)) {
    return null;
  }

  const getInstalled =
    envOrSeam &&
    typeof envOrSeam === "object" &&
    "getInstalledBrowsers" in envOrSeam &&
    typeof envOrSeam.getInstalledBrowsers === "function"
      ? (envOrSeam.getInstalledBrowsers as typeof getInstalledBrowsers)
      : getInstalledBrowsers;

  try {
    const installed = await getInstalled({ cacheDir: targetDir });
    for (const browser of installed) {
      if (browser.executablePath && existsSync(browser.executablePath)) {
        const check = await verifyBrowserExecutable(
          browser.executablePath,
          timeoutMs,
        );
        if (check.valid && check.version) {
          return {
            path: browser.executablePath,
            version: check.version,
          };
        }
      }
    }
  } catch {
    // Return null if reading cache fails
  }

  return null;
}

/**
 * Discovers standard system-level Google Chrome and Chromium installations via `chrome-launcher`.
 *
 * @param getInstallationsSeam - Optional injected installation lookup seam for unit testing.
 * @returns Deduplicated array of existing filesystem paths to system Chrome/Chromium binaries.
 */
export async function probeSystemInstallations(
  getInstallationsSeam?: () => string[],
): Promise<string[]> {
  try {
    const launcherFn =
      getInstallationsSeam ?? chromeLauncher.Launcher.getInstallations;
    const installations = launcherFn();
    return Array.from(new Set(installations.filter((p) => existsSync(p))));
  } catch {
    return [];
  }
}

/**
 * Accepted configuration seam inputs for {@link probeAlternativeBrowsers}.
 */
export type ProbeAlternativeBrowsersOptions = BrowserSeamOptions | EnvMap;

/**
 * Probes standard OS installation paths for Chromium-based alternative browsers (Microsoft Edge and Brave).
 *
 * @param optionsOrEnv - Optional environment or seam configuration.
 * @param platformOverride - Optional OS platform override (`"linux"`, `"darwin"`, `"win32"`).
 * @returns Array of executable {@link CandidateBrowser} entries tagged with `"edge"` or `"brave"`.
 */
export async function probeAlternativeBrowsers(
  optionsOrEnv?: ProbeAlternativeBrowsersOptions,
  platformOverride?: NodeJS.Platform | string,
): Promise<Array<CandidateBrowser<"edge" | "brave">>> {
  const seam = resolveSeam(optionsOrEnv, platformOverride);
  const osType = resolvePlatform(seam);
  const rawCandidates: Array<CandidateBrowser<"edge" | "brave">> = [];

  if (osType === "linux") {
    rawCandidates.push(
      { path: "/usr/bin/microsoft-edge", source: "edge" },
      { path: "/usr/bin/microsoft-edge-stable", source: "edge" },
      { path: "/usr/bin/microsoft-edge-dev", source: "edge" },
      { path: "/usr/bin/msedge", source: "edge" },
      { path: "/usr/bin/brave-browser", source: "brave" },
      { path: "/usr/bin/brave", source: "brave" },
      { path: "/snap/bin/brave", source: "brave" },
    );
  } else if (osType === "darwin") {
    rawCandidates.push(
      {
        path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        source: "edge",
      },
      {
        path: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        source: "brave",
      },
    );
  } else if (osType === "win32") {
    const { programFiles, programFilesX86 } = resolveWindowsProgramFiles(seam);
    rawCandidates.push(
      {
        path: join(
          programFilesX86,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        ),
        source: "edge",
      },
      {
        path: join(
          programFiles,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        ),
        source: "edge",
      },
      {
        path: join(
          programFiles,
          "BraveSoftware",
          "Brave-Browser",
          "Application",
          "brave.exe",
        ),
        source: "brave",
      },
    );
  }

  return rawCandidates.filter((item) => isExecutable(item.path));
}

/**
 * Resolves the Playwright browser cache base directory across platforms and environment overrides.
 */
function getPlaywrightCacheBase(
  home: string,
  osType: NodeJS.Platform | string,
  seam?: BrowserConfigSeam,
): string {
  const browsersPath = resolvePlaywrightCustomPath(seam);

  if (browsersPath !== undefined && browsersPath.length > 0) {
    const cwd = resolveCwd(seam);
    if (browsersPath === "0") {
      try {
        const req = createRequire(join(cwd, "noop.js"));
        const pkgJson = req.resolve("playwright-core/package.json");
        return join(dirname(pkgJson), ".local-browsers");
      } catch {
        return join(cwd, "node_modules", "playwright-core", ".local-browsers");
      }
    }
    return pathResolve(cwd, browsersPath);
  }

  if (osType === "darwin") {
    return join(home, "Library", "Caches", "ms-playwright");
  }
  if (osType === "win32") {
    const localAppData = resolveLocalAppData(seam);
    return localAppData
      ? join(localAppData, "ms-playwright")
      : join(home, "AppData", "Local", "ms-playwright");
  }

  const xdgCache = resolveXdgCacheHome(seam);
  return xdgCache
    ? join(xdgCache, "ms-playwright")
    : join(home, ".cache", "ms-playwright");
}

/**
 * Scans a Playwright cache directory for executable Chromium and headless shell binaries.
 */
function scanPlaywrightCacheDir(
  playwrightBase: string,
): Array<CandidateBrowser<"playwright">> {
  if (!existsSync(playwrightBase)) {
    return [];
  }

  const found: Array<CandidateBrowser<"playwright">> = [];
  try {
    for (const entry of readdirSync(playwrightBase)) {
      if (
        !entry.startsWith("chromium-") &&
        !entry.startsWith("chromium_headless_shell-")
      ) {
        continue;
      }
      for (const relSegments of PLAYWRIGHT_RELATIVE_BINARY_PATHS) {
        const candidate = join(playwrightBase, entry, ...relSegments);
        if (isExecutable(candidate)) {
          found.push({ path: candidate, source: "playwright" });
        }
      }
    }
  } catch {
    // Ignore read errors
  }
  return found;
}

/**
 * Scans a Puppeteer cache directory for executable browser binaries.
 */
async function scanPuppeteerCacheDir(
  puppeteerBase: string,
): Promise<Array<CandidateBrowser<"puppeteer">>> {
  if (!existsSync(puppeteerBase)) {
    return [];
  }

  const found: Array<CandidateBrowser<"puppeteer">> = [];
  try {
    const installed = await getInstalledBrowsers({ cacheDir: puppeteerBase });
    for (const browser of installed) {
      if (browser.executablePath && isExecutable(browser.executablePath)) {
        found.push({ path: browser.executablePath, source: "puppeteer" });
      }
    }
  } catch {
    // Ignore read errors
  }
  return found;
}

/**
 * Accepted configuration seam inputs for {@link probeToolCaches}.
 */
export type ProbeToolCachesOptions =
  BrowserSeamOptions | BrowserConfigSeam | EnvMap;

/**
 * Probes local Playwright and Puppeteer browser cache directories for existing Chromium binaries.
 *
 * @param home - User home directory path used to locate default tool caches. Defaults to `os.homedir()`.
 * @param envOrSeam - Optional environment map or {@link BrowserConfigSeam} override.
 * @returns Array of executable {@link CandidateBrowser} entries tagged with `"playwright"` or `"puppeteer"`.
 */
export async function probeToolCaches(
  home = homedir(),
  envOrSeam?: ProbeToolCachesOptions,
): Promise<Array<CandidateBrowser<"playwright" | "puppeteer">>> {
  const seam = resolveSeam(envOrSeam);
  const osType = resolvePlatform(seam);
  const playwrightBase = getPlaywrightCacheBase(home, osType, seam);
  const puppeteerBase = resolvePuppeteerCacheDir(home, seam);

  const playwrightFound = scanPlaywrightCacheDir(playwrightBase);
  const puppeteerFound = await scanPuppeteerCacheDir(puppeteerBase);

  return [...playwrightFound, ...puppeteerFound];
}
