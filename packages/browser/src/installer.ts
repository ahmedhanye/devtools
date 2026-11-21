import { mkdirSync } from "node:fs";
import {
  Browser,
  detectBrowserPlatform,
  install as defaultInstall,
  resolveBuildId as defaultResolveBuildId,
  type InstallOptions,
} from "@puppeteer/browsers";
import { resolveManagedCacheDir } from "./config";
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

function createInstallAbortError(signal: AbortSignal): Error {
  return new Error("Browser installation was aborted", {
    cause: signal.reason,
  });
}

async function raceWithAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    throw createInstallAbortError(signal);
  }
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        onAbort = () => {
          void promise.catch(() => {});
          reject(createInstallAbortError(signal));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

/**
 * Downloads and unpacks the `stable` build of `chrome-headless-shell` into the managed DevTools browser cache.
 *
 * @param options - Optional cache directory override, cancellation signal, and download progress callback.
 * @param deps - Optional dependency injection seam for testing without network I/O.
 * @returns Metadata describing the installed browser executable, build ID, and browser type.
 * @throws {@link Error} If the current OS/architecture platform is unsupported, aborted via `signal`, or archive download fails.
 */
export async function installBrowser(
  options?: InstallBrowserOptions,
  deps?: BrowserInstallerDependencies,
): Promise<InstalledBrowser> {
  if (options?.signal?.aborted) {
    throw createInstallAbortError(options.signal);
  }

  const cacheDir =
    options?.cacheDir ??
    resolveManagedCacheDir(undefined, { env: options?.env });
  mkdirSync(cacheDir, { recursive: true });

  const resolveBuild = deps?.resolveBuildId ?? defaultResolveBuildId;
  const runInstall = deps?.install ?? defaultInstall;

  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error("Unsupported platform for browser installation");
  }

  const buildId = await raceWithAbort(
    resolveBuild(Browser.CHROMEHEADLESSSHELL, platform, "stable"),
    options?.signal,
  );

  const installed = await raceWithAbort(
    runInstall({
      browser: Browser.CHROMEHEADLESSSHELL,
      buildId,
      cacheDir,
      unpack: true,
      downloadProgressCallback: options?.onProgress
        ? (downloadedBytes: number, totalBytes: number) => {
            options.onProgress?.(downloadedBytes, totalBytes);
          }
        : undefined,
    }),
    options?.signal,
  );

  return {
    executablePath: installed.executablePath,
    buildId: installed.buildId,
    browser: installed.browser,
  };
}
