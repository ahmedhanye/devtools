import { mkdirSync } from "node:fs";
import {
  Browser,
  detectBrowserPlatform,
  install as defaultInstall,
  resolveBuildId as defaultResolveBuildId,
  type InstallOptions,
} from "@puppeteer/browsers";
import { getManagedCacheDir } from "./detector";
import type { InstallBrowserOptions, InstalledBrowser } from "./types";

export type InstallResult = InstalledBrowser;

export interface BrowserInstallerDependencies {
  resolveBuildId?: (
    browser: Browser,
    platform: ReturnType<typeof detectBrowserPlatform>,
    tag: string,
  ) => Promise<string>;
  install?: (
    options: InstallOptions & { unpack?: true },
  ) => Promise<InstallResult>;
}

export async function installBrowser(
  options?: InstallBrowserOptions,
  deps?: BrowserInstallerDependencies,
): Promise<InstalledBrowser> {
  const cacheDir = options?.cacheDir ?? getManagedCacheDir();
  mkdirSync(cacheDir, { recursive: true });

  const resolveBuild = deps?.resolveBuildId ?? defaultResolveBuildId;
  const runInstall = deps?.install ?? defaultInstall;

  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error("Unsupported platform for browser installation");
  }

  const buildId = await resolveBuild(
    Browser.CHROMEHEADLESSSHELL,
    platform,
    "stable",
  );

  const installed = await runInstall({
    browser: Browser.CHROMEHEADLESSSHELL,
    buildId,
    cacheDir,
    unpack: true,
    downloadProgressCallback: options?.onProgress
      ? (downloadedBytes: number, totalBytes: number) => {
          options.onProgress?.(downloadedBytes, totalBytes);
        }
      : undefined,
  });

  return {
    executablePath: installed.executablePath,
    buildId: installed.buildId,
    browser: installed.browser,
  };
}
