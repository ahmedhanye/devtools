import type { EnvMap } from "@devtools/core";

/**
 * Origin tier from which a Chromium-compatible browser binary was discovered.
 *
 * - `"explicit"`: Provided via `--chrome-path`, `DEVTOOLS_CHROME_PATH`, or `CHROME_PATH`.
 * - `"managed-cache"`: Provisioned in `~/.devtools/browsers` (or `DEVTOOLS_BROWSERS_DIR`).
 * - `"system"`: Standard OS installation of Google Chrome or Chromium.
 * - `"edge"`: System installation of Microsoft Edge.
 * - `"brave"`: System installation of Brave Browser.
 * - `"playwright"`: Local Playwright browser cache (`ms-playwright`).
 * - `"puppeteer"`: Local Puppeteer browser cache (`.cache/puppeteer`).
 */
export type BrowserSource =
  | "explicit"
  | "managed-cache"
  | "system"
  | "edge"
  | "brave"
  | "playwright"
  | "puppeteer";

/**
 * Verified browser executable metadata returned by {@link resolveBrowserPath}.
 */
export interface BrowserResolution {
  /** Absolute filesystem path to the verified executable binary. */
  executablePath: string;
  /** Version string reported by the binary (for example, `"Google Chrome 131.0.6778.85"`). */
  version: string;
  /** Discovery tier that supplied the binary. */
  source: BrowserSource;
}

/**
 * Configuration options for resolving a Chromium-compatible browser executable.
 */
export interface ResolveBrowserOptions {
  /**
   * Explicit path to a browser binary (`--chrome-path`).
   * If set and invalid, resolution fails immediately without falling back to Tier 2.
   */
  chromePath?: string;
  /** Isolated environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Custom managed browser cache directory overriding `~/.devtools/browsers`. */
  cacheDir?: string;
  /**
   * Maximum time in milliseconds to wait for `--version` verification per candidate.
   * @defaultValue 3000
   */
  timeoutMs?: number;
}

/**
 * Machine-readable error codes emitted when browser resolution fails.
 */
export type BrowserErrorCode = "BROWSER_NOT_FOUND" | "INVALID_BROWSER_PATH";

/**
 * Discriminated union representing the non-throwing status result of {@link getBrowserStatus}.
 */
export type BrowserStatus =
  | {
      /** Indicates a working Chromium-compatible binary was resolved. */
      found: true;
      /** Absolute filesystem path to the verified executable binary. */
      path: string;
      /** Version string reported by the binary. */
      version: string;
      /** Discovery tier that supplied the binary. */
      source: BrowserSource;
    }
  | {
      /** Indicates browser resolution failed. */
      found: false;
      /** Optional machine-readable error code classifying the failure. */
      code?: BrowserErrorCode | (string & {});
      /** Actionable human-readable diagnostic and remediation message. */
      error: string;
    };

/**
 * Options for provisioning a managed `chrome-headless-shell` binary via {@link installBrowser}.
 */
export interface InstallBrowserOptions {
  /**
   * Target directory where the browser archive is downloaded and unpacked.
   * Defaults to `~/.devtools/browsers` (or `DEVTOOLS_BROWSERS_DIR`).
   */
  cacheDir?: string;
  /**
   * Optional callback invoked periodically during archive download.
   *
   * @param downloadedBytes - Cumulative bytes received so far.
   * @param totalBytes - Total expected archive size in bytes.
   */
  onProgress?: (downloadedBytes: number, totalBytes: number) => void;
}

/**
 * Metadata describing a newly provisioned browser installation returned by {@link installBrowser}.
 */
export interface InstalledBrowser {
  /** Absolute filesystem path to the unpacked browser executable. */
  executablePath: string;
  /** Resolved upstream build identifier (for example, `"131.0.6778.85"`). */
  buildId: string;
  /** Installed browser identifier (for example, `"chrome-headless-shell"`). */
  browser: string;
}
