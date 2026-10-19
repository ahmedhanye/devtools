export const DEFAULT_BROWSER_NOT_FOUND_MESSAGE =
  'No Chromium-compatible browser found.\nRun "devtools browser install" to install Chrome for Testing,\nor pass "--chrome-path <path>" to specify an existing binary.';

export class BrowserNotFoundError extends Error {
  readonly exitCode = 1;
  readonly code = "BROWSER_NOT_FOUND" as const;

  constructor(message = DEFAULT_BROWSER_NOT_FOUND_MESSAGE) {
    super(message);
    this.name = "BrowserNotFoundError";
  }
}

export class InvalidBrowserPathError extends Error {
  readonly exitCode = 1;
  readonly code = "INVALID_BROWSER_PATH" as const;

  constructor(path: string, reason?: string) {
    const detail = reason ? `: ${reason}` : "";
    super(
      `Specified browser path is invalid or non-executable: "${path}"${detail}`,
    );
    this.name = "InvalidBrowserPathError";
  }
}
