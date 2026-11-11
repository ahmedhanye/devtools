import { spawn } from "node:child_process";
import fs from "node:fs";
import type { LighthouseRunRow } from "@devtools/db";
import {
  getLatestLighthouseRun,
  resolveLighthouseRun,
} from "@devtools/lighthouse";
import {
  connectRequiredLighthouseDb,
  createLighthouseCliContext,
} from "./context";
import { LighthouseOpenerError } from "./errors";
import type {
  LighthouseOpenCommandDeps,
  LighthouseOpenCommandOptions,
} from "./types";

/**
 * Detects whether the current execution context is a headless environment (CI or Linux without display server).
 *
 * @param env - Environment variables dictionary. Defaults to `process.env`.
 * @param platform - Operating system platform. Defaults to `process.platform`.
 * @returns `true` when execution is detected to be headless, `false` otherwise.
 */
export function defaultIsHeadless(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (env.CI === "true" || env.CONTINUOUS_INTEGRATION === "true") {
    return true;
  }
  if (platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY) {
    return true;
  }
  return false;
}

/**
 * Spawns the appropriate OS-specific browser opener detached subprocess.
 *
 * @param filePath - Local filesystem path to the HTML report artifact.
 * @param platform - Operating system platform. Defaults to `process.platform`.
 * @throws {@link LighthouseOpenerError} When opener command fails to spawn or emits error.
 */
export async function defaultSpawnOpener(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const [cmd, args] =
    platform === "darwin"
      ? ["open", [filePath]]
      : platform === "win32"
        ? ["cmd.exe", ["/c", "start", "", filePath]]
        : ["xdg-open", [filePath]];

  return new Promise<void>((resolve, reject) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
      if (typeof child.on === "function") {
        child.on("error", (err) => {
          reject(
            new LighthouseOpenerError(
              `Failed to open report with ${cmd}: ${err.message}`,
              { cause: err },
            ),
          );
        });
        child.on("spawn", () => {
          child.unref?.();
          resolve();
        });
      } else {
        child.unref?.();
        resolve();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      reject(
        new LighthouseOpenerError(
          `Failed to open report with ${cmd}: ${message}`,
          { cause: err instanceof Error ? err : undefined },
        ),
      );
    }
  });
}

/**
 * Executes the `devtools lighthouse open [id]` command, resolving the HTML report artifact
 * and opening it in the default system browser or printing a `file://` URI in headless environments.
 *
 * @param id - Optional run ID or unique prefix. Defaults to latest run.
 * @param options - Parsed CLI open options.
 * @param deps - Injected dependencies for hermetic testing.
 */
export async function runLighthouseOpenCommand(
  id?: string,
  options: LighthouseOpenCommandOptions = {},
  deps?: LighthouseOpenCommandDeps,
): Promise<void> {
  const ctx = createLighthouseCliContext(options, deps);
  const { pc, log, error, exit } = ctx;
  const fileExists = deps?.fileExists ?? fs.existsSync;
  const isHeadless = deps?.isHeadless ?? defaultIsHeadless;
  const spawnOpener = deps?.spawnOpener ?? defaultSpawnOpener;

  const db = await connectRequiredLighthouseDb(ctx);
  if (!db) {
    return;
  }

  let run: LighthouseRunRow;
  try {
    run =
      id !== undefined
        ? resolveLighthouseRun(db, id)
        : getLatestLighthouseRun(db);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(pc.red(message));
    exit(1);
    return;
  }

  if (!fileExists(run.htmlReportPath)) {
    error(
      pc.red(
        `Report artifact file not found at: ${run.htmlReportPath}. The file may have been moved or cleaned up.`,
      ),
    );
    exit(1);
    return;
  }

  if (isHeadless(options.env)) {
    log(`file://${run.htmlReportPath}`);
    exit(0);
    return;
  }

  try {
    await spawnOpener(run.htmlReportPath);
    log(
      pc.green(`Opening Lighthouse HTML report at:\n  ${run.htmlReportPath}`),
    );
  } catch (err: unknown) {
    const cause = err instanceof Error ? err : undefined;
    const openerErr = new LighthouseOpenerError(
      `Failed to launch browser viewer: ${cause ? cause.message : String(err)}`,
      cause ? { cause } : undefined,
    );
    error(pc.red(openerErr.message));
    exit(openerErr.exitCode);
  }
}
