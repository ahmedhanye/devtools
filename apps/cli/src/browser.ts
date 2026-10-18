import {
  getBrowserStatus,
  installBrowser,
  type BrowserStatus,
} from "@devtools/browser";
import { Command } from "commander";
import pc from "picocolors";

export interface BrowserStatusOptions {
  json?: boolean;
  chromePath?: string;
  path?: string;
}

export interface BrowserInstallOptions {
  path?: string;
}

export async function runBrowserStatusCommand(
  options: BrowserStatusOptions = {},
  deps?: { getBrowserStatus?: typeof getBrowserStatus },
): Promise<void> {
  const doStatus = deps?.getBrowserStatus ?? getBrowserStatus;
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

export async function runBrowserInstallCommand(
  options: BrowserInstallOptions = {},
  deps?: { installBrowser?: typeof installBrowser },
): Promise<void> {
  const isTTY = Boolean(process.stderr.isTTY);
  const doInstall = deps?.installBrowser ?? installBrowser;

  console.error(
    pc.cyan("Installing Chrome for Testing (chrome-headless-shell@stable)..."),
  );

  try {
    let lastPercent = -1;
    const installed = await doInstall({
      cacheDir: options.path,
      onProgress: (downloadedBytes, totalBytes) => {
        if (isTTY && totalBytes > 0) {
          const percent = Math.floor((downloadedBytes / totalBytes) * 100);
          if (percent !== lastPercent) {
            lastPercent = percent;
            process.stderr.write(
              `\rDownloading chrome-headless-shell: ${percent}%`,
            );
          }
        }
      },
    });

    if (isTTY) {
      process.stderr.write("\n");
    }

    console.log(
      pc.green(
        `Successfully installed ${installed.browser}@${installed.buildId} at:\n  ${installed.executablePath}`,
      ),
    );
  } catch (err: unknown) {
    if (isTTY) {
      process.stderr.write("\n");
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(pc.red(`Failed to install browser: ${message}`));
    process.exit(1);
  }
}

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
