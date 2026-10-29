import type {
  BrowserStatus,
  getBrowserStatus as GetBrowserStatusFn,
  installBrowser as InstallBrowserFn,
} from "@devtools/browser";
import { Command } from "commander";
import pc from "picocolors";

/**
 * CLI flag options for `devtools browser status`.
 */
export interface BrowserStatusOptions {
  /** Emit machine-readable JSON output instead of human-formatted text. */
  json?: boolean;
  /** Explicit browser executable path to verify (`--chrome-path`). */
  chromePath?: string;
  /** Custom managed browser cache directory (`--path`). */
  path?: string;
}

/**
 * CLI flag options for `devtools browser install`.
 */
export interface BrowserInstallOptions {
  /** Custom target directory to download and unpack the browser into (`--path`). */
  path?: string;
}

/**
 * Executes the `devtools browser status` command, printing browser resolution details
 * in either human-readable or `--json` format and exiting with code `1` if unresolved.
 *
 * @param options - Parsed CLI status options.
 * @param deps - Optional injected `getBrowserStatus` implementation for unit testing.
 */
export async function runBrowserStatusCommand(
  options: BrowserStatusOptions = {},
  deps?: { getBrowserStatus?: typeof GetBrowserStatusFn },
): Promise<void> {
  const doStatus =
    deps?.getBrowserStatus ??
    (await import("@devtools/browser")).getBrowserStatus;
  const status: BrowserStatus = await doStatus({
    chromePath: options.chromePath,
    cacheDir: options.path,
  });

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    if (!status.found) {
      process.exit(1);
    }
    return;
  }

  if (status.found) {
    console.log(pc.green("Chromium-compatible browser found:"));
    console.log(`  ${pc.bold("Path:")}    ${status.path}`);
    console.log(`  ${pc.bold("Version:")} ${status.version}`);
    console.log(`  ${pc.bold("Source:")}  ${status.source}`);
  } else {
    console.error(pc.red(status.error));
    process.exit(1);
  }
}

/**
 * Creates a deduplicated stderr progress callback for interactive TTY sessions.
 */
function createDownloadProgressReporter(
  isTTY: boolean,
  writeStderr: (chunk: string) => void = (chunk) => process.stderr.write(chunk),
): (downloadedBytes: number, totalBytes: number) => void {
  let lastPercent = -1;
  return (downloadedBytes: number, totalBytes: number) => {
    if (!isTTY || totalBytes <= 0) {
      return;
    }
    const percent = Math.floor((downloadedBytes / totalBytes) * 100);
    if (percent !== lastPercent) {
      lastPercent = percent;
      writeStderr(`\rDownloading chrome-headless-shell: ${percent}%`);
    }
  };
}

/**
 * Executes the `devtools browser install` command, provisioning `chrome-headless-shell@stable`
 * into the managed browser cache and reporting progress to `stderr`.
 *
 * @param options - Parsed CLI install options.
 * @param deps - Optional injected dependencies and streams for testing.
 */
export async function runBrowserInstallCommand(
  options: BrowserInstallOptions = {},
  deps?: {
    installBrowser?: typeof InstallBrowserFn;
    isTTY?: boolean;
    writeStderr?: (chunk: string) => void;
  },
): Promise<void> {
  const isTTY = deps?.isTTY ?? Boolean(process.stderr.isTTY);
  const writeStderr =
    deps?.writeStderr ?? ((chunk: string) => process.stderr.write(chunk));
  const doInstall =
    deps?.installBrowser ?? (await import("@devtools/browser")).installBrowser;

  console.error(
    pc.cyan("Installing Chrome for Testing (chrome-headless-shell@stable)..."),
  );

  try {
    const installed = await doInstall({
      cacheDir: options.path,
      onProgress: createDownloadProgressReporter(isTTY, writeStderr),
    });

    if (isTTY) {
      writeStderr("\n");
    }

    console.log(
      pc.green(
        `Successfully installed ${installed.browser}@${installed.buildId} at:\n  ${installed.executablePath}`,
      ),
    );
  } catch (err: unknown) {
    if (isTTY) {
      writeStderr("\n");
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(pc.red(`Failed to install browser: ${message}`));
    process.exit(1);
  }
}

/**
 * Registers the `devtools browser` subcommand hierarchy (`status` and `install`) on a Commander program.
 *
 * @param program - Root Commander `Command` instance.
 * @returns Configured `browser` subcommand instance.
 */
export function registerBrowserCommands(program: Command): Command {
  const browser = program
    .command("browser")
    .description(
      "Manage and inspect local browser provisioning for audit tools",
    );

  browser
    .command("status")
    .description("Check resolution status of Chromium-compatible browsers")
    .option("--json", "Output browser status as JSON")
    .option(
      "--chrome-path <path>",
      "Specify an explicit browser binary path to test",
    )
    .option("--path <dir>", "Custom directory to probe managed cache in")
    .action(async (options: BrowserStatusOptions) => {
      await runBrowserStatusCommand(options);
    });

  browser
    .command("install")
    .description(
      "Install Chrome for Testing (chrome-headless-shell@stable) into managed cache",
    )
    .option(
      "--path <dir>",
      "Custom directory to download and unpack browser into",
    )
    .action(async (options: BrowserInstallOptions) => {
      await runBrowserInstallCommand(options);
    });

  return browser;
}
