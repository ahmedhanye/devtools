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
import { getInstalledBrowsers } from "@puppeteer/browsers";
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
} from "../config";

export interface VerificationResult {
  valid: boolean;
  version?: string;
}

export interface CandidateBrowser<TSource extends string = string> {
  path: string;
  source: TSource;
}

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

export async function verifyBrowserExecutable(
  executablePath: string,
  timeoutMs = 3000,
): Promise<VerificationResult> {
  if (!isExecutable(executablePath)) {
    return { valid: false };
  }

  let proc: ReturnType<typeof Bun.spawn> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const isWin = platform() === "win32";
  const lowerPath = executablePath.toLowerCase();
  const isWindowsGuiBinary =
    isWin && lowerPath.endsWith(".exe") && !lowerPath.includes("headless");

  try {
    const exitedPromise = new Promise<{ code: number; stdout: string }>(
      (resolve, reject) => {
        try {
          if (isWindowsGuiBinary) {
            const escapedPath = executablePath.replace(/'/g, "''");
            proc = Bun.spawn(
              [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                `(Get-Item -LiteralPath '${escapedPath}').VersionInfo.ProductVersion`,
              ],
              {
                stdout: "pipe",
                stderr: "ignore",
              },
            );
          } else {
            proc = Bun.spawn([executablePath, "--version"], {
              stdout: "pipe",
              stderr: "ignore",
            });
          }

          timer = setTimeout(() => {
            try {
              proc?.kill();
            } catch {
              // ignore
            }
            resolve({ code: -1, stdout: "" });
          }, timeoutMs);

          const stdoutPromise =
            proc.stdout && typeof proc.stdout !== "number"
              ? new Response(proc.stdout).text()
              : Promise.resolve("");

          Promise.all([proc.exited, stdoutPromise])
            .then(([code, text]) => {
              if (timer) clearTimeout(timer);
              resolve({ code, stdout: text });
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
      },
    );

    const { code, stdout } = await exitedPromise;

    if (code === 0 && stdout.trim().length > 0) {
      const firstLine = stdout.trim().split("\n")[0]?.trim() ?? "";
      return { valid: true, version: firstLine };
    }

    return { valid: false };
  } catch {
    return { valid: false };
  } finally {
    if (timer) clearTimeout(timer);
    try {
      proc?.kill();
    } catch {
      // ignore
    }
  }
}

export type ManagedCacheDirOptions =
  BrowserSeamOptions | BrowserConfigSeam | Record<string, string | undefined>;

export function getManagedCacheDir(envOrSeam?: ManagedCacheDirOptions): string {
  const seam = resolveSeam(envOrSeam);
  return resolveManagedCacheDir(undefined, seam);
}

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

  try {
    const installed = await getInstalledBrowsers({ cacheDir: targetDir });
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

export async function probeSystemInstallations(): Promise<string[]> {
  try {
    const installations = chromeLauncher.Launcher.getInstallations();
    return Array.from(new Set(installations.filter((p) => existsSync(p))));
  } catch {
    return [];
  }
}

export type ProbeAlternativeBrowsersOptions =
  BrowserSeamOptions | Record<string, string | undefined>;

export async function probeAlternativeBrowsers(
  optionsOrEnv?: ProbeAlternativeBrowsersOptions,
  platformOverride?: NodeJS.Platform | string,
): Promise<Array<CandidateBrowser<"edge" | "brave">>> {
  const seam = resolveSeam(optionsOrEnv, platformOverride);
  const osType = resolvePlatform(seam);
  const rawCandidates: Array<{ path: string; source: "edge" | "brave" }> = [];

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
    if (localAppData && localAppData.length > 0) {
      return join(localAppData, "ms-playwright");
    }
    return join(home, "AppData", "Local", "ms-playwright");
  }

  const xdgCache = resolveXdgCacheHome(seam);
  if (xdgCache && xdgCache.length > 0) {
    return join(xdgCache, "ms-playwright");
  }

  return join(home, ".cache", "ms-playwright");
}

function getPuppeteerCacheBase(home: string, seam?: BrowserConfigSeam): string {
  return resolvePuppeteerCacheDir(home, seam);
}

export type ProbeToolCachesOptions =
  BrowserSeamOptions | BrowserConfigSeam | Record<string, string | undefined>;

export async function probeToolCaches(
  home = homedir(),
  envOrSeam?: ProbeToolCachesOptions,
): Promise<Array<CandidateBrowser<"playwright" | "puppeteer">>> {
  const seam = resolveSeam(envOrSeam);
  const osType = resolvePlatform(seam);
  const found: Array<CandidateBrowser<"playwright" | "puppeteer">> = [];

  // 1. Playwright cache
  const playwrightBase = getPlaywrightCacheBase(home, osType, seam);

  if (existsSync(playwrightBase)) {
    try {
      const entries = readdirSync(playwrightBase);
      for (const entry of entries) {
        if (
          entry.startsWith("chromium-") ||
          entry.startsWith("chromium_headless_shell-")
        ) {
          const candidates = [
            join(playwrightBase, entry, "chrome-linux", "chrome"),
            join(playwrightBase, entry, "chrome-linux", "headless_shell"),
            join(playwrightBase, entry, "chrome-linux64", "chrome"),
            join(
              playwrightBase,
              entry,
              "chrome-headless-shell-linux64",
              "chrome-headless-shell",
            ),
            join(
              playwrightBase,
              entry,
              "chrome-mac",
              "Chromium.app",
              "Contents",
              "MacOS",
              "Chromium",
            ),
            join(
              playwrightBase,
              entry,
              "chrome-mac",
              "Google Chrome for Testing.app",
              "Contents",
              "MacOS",
              "Google Chrome for Testing",
            ),
            join(
              playwrightBase,
              entry,
              "chrome-mac-arm64",
              "Chromium.app",
              "Contents",
              "MacOS",
              "Chromium",
            ),
            join(
              playwrightBase,
              entry,
              "chrome-mac-arm64",
              "Google Chrome for Testing.app",
              "Contents",
              "MacOS",
              "Google Chrome for Testing",
            ),
            join(
              playwrightBase,
              entry,
              "chrome-headless-shell-mac",
              "chrome-headless-shell",
            ),
            join(
              playwrightBase,
              entry,
              "chrome-headless-shell-mac-arm64",
              "chrome-headless-shell",
            ),
            join(playwrightBase, entry, "chrome-win", "chrome.exe"),
            join(playwrightBase, entry, "chrome-win64", "chrome.exe"),
            join(
              playwrightBase,
              entry,
              "chrome-headless-shell-win64",
              "chrome-headless-shell.exe",
            ),
          ];

          for (const candidate of candidates) {
            if (isExecutable(candidate)) {
              found.push({ path: candidate, source: "playwright" });
            }
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  // 2. Puppeteer cache
  const puppeteerBase = getPuppeteerCacheBase(home, seam);

  if (existsSync(puppeteerBase)) {
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
  }

  return found;
}
