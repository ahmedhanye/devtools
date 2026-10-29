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

/**
 * Alias for {@link InstalledBrowser} representing the return payload of `@puppeteer/browsers` installation.
 */
export type InstallResult = InstalledBrowser;

/**
 * Injectable dependency seam for {@link installBrowser} allowing unit tests to mock
 * network build resolution and archive downloads.
 */
export interface BrowserInstallerDependencies {
  /** Overrides `@puppeteer/browsers` `resolveBuildId` network lookup. */
  resolveBuildId?: (
    browser: Browser,
    platform: ReturnType<typeof detectBrowserPlatform>,
    tag: string,
  ) => Promise<string>;
  /** Overrides `@puppeteer/browsers` `install` archive download and extraction. */
  install?: (
    options: InstallOptions & { unpack?: true },
  ) => Promise<InstallResult>;
}

/**
 * Downloads and unpacks the `stable` build of `chrome-headless-shell` into the managed DevTools browser cache.
 *
 * @param options - Optional cache directory override and download progress callback.
 * @param deps - Optional dependency injection seam for testing without network I/O.
 * @returns Metadata describing the installed browser executable, build ID, and browser type.
 * @throws {@link Error} If the current OS/architecture platform is unsupported or archive download fails.
 */
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
