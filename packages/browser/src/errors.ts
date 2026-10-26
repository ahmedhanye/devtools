/**
 * Default remediation guidance message displayed when no Chromium-compatible
 * browser is found across any discovery tier.
 */
export const DEFAULT_BROWSER_NOT_FOUND_MESSAGE =
  'No Chromium-compatible browser found.\nRun "devtools browser install" to install Chrome for Testing,\nor pass "--chrome-path <path>" to specify an existing binary.';

/**
 * Terminal error thrown when all browser discovery tiers are exhausted without
 * finding a runnable Chromium-compatible executable.
 */
export class BrowserNotFoundError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  readonly exitCode = 1;
  /** Machine-readable error code (`"BROWSER_NOT_FOUND"`). */
  readonly code = "BROWSER_NOT_FOUND" as const;

  /**
   * Creates a new {@link BrowserNotFoundError}.
   *
   * @param message - Optional custom error message. Defaults to {@link DEFAULT_BROWSER_NOT_FOUND_MESSAGE}.
   */
  constructor(message = DEFAULT_BROWSER_NOT_FOUND_MESSAGE) {
    super(message);
    this.name = "BrowserNotFoundError";
  }
}

/**
 * Error thrown when an explicit browser path (`--chrome-path`, `DEVTOOLS_CHROME_PATH`,
 * or `CHROME_PATH`) is empty, missing on disk, non-executable, or fails verification.
 *
 * @remarks
 * Tier 1 explicit overrides halt immediately with this error rather than falling back
 * to Tier 2 system discovery so misconfigured paths surface deterministically.
 */
export class InvalidBrowserPathError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  readonly exitCode = 1;
  /** Machine-readable error code (`"INVALID_BROWSER_PATH"`). */
  readonly code = "INVALID_BROWSER_PATH" as const;

  /**
   * Creates a new {@link InvalidBrowserPathError}.
   *
   * @param path - The invalid browser path string supplied by the caller.
   * @param reason - Optional diagnostic explanation of why verification failed.
   */
  constructor(path: string, reason?: string) {
    const detail = reason ? `: ${reason}` : "";
    super(
      `Specified browser path is invalid or non-executable: "${path}"${detail}`,
    );
    this.name = "InvalidBrowserPathError";
  }
}
