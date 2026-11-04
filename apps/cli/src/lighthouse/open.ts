import fs from "node:fs";
import type { DevtoolsDb, LighthouseRunRow } from "@devtools/db";
import pc from "picocolors";
import { LighthouseOpenerError } from "./errors";
import { resolveLatestRun, resolveRunId } from "./resolvers";
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
 */
export async function defaultSpawnOpener(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const { spawn } = await import("node:child_process");
  if (platform === "darwin") {
    spawn("open", [filePath], { detached: true, stdio: "ignore" }).unref();
  } else if (platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", filePath], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } else {
    spawn("xdg-open", [filePath], { detached: true, stdio: "ignore" }).unref();
  }
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
  const exit = (code = 1) => {
    if (deps?.exit) {
      deps.exit(code);
      return;
    }
    process.exit(code);
  };

  const log = deps?.log ?? console.log;
  const error = deps?.error ?? console.error;
  const getDb = deps?.getDb ?? (await import("@devtools/db")).getDb;
  const fileExists = deps?.fileExists ?? fs.existsSync;
  const isHeadless = deps?.isHeadless ?? defaultIsHeadless;
  const spawnOpener = deps?.spawnOpener ?? defaultSpawnOpener;

  let db: DevtoolsDb;
  try {
    db = getDb();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(pc.red(`Error connecting to database: ${message}`));
    exit(1);
    return;
  }

  let run: LighthouseRunRow;
  try {
    run = id ? resolveRunId(db, id) : resolveLatestRun(db);
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
