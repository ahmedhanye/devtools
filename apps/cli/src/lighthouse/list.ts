import { LighthouseFormFactorSchema } from "@devtools/lighthouse/schemas";
import {
  connectRequiredLighthouseDb,
  createLighthouseCliContext,
  type LighthouseCliContext,
} from "./context";
import { formatJson } from "./formatters/json";
import { formatTerminalList } from "./formatters/terminal";
import type {
  LighthouseListCommandDeps,
  LighthouseListCommandOptions,
} from "./types";

function validateListOptions(
  options: LighthouseListCommandOptions,
  ctx: LighthouseCliContext,
): boolean {
  if (
    options.formFactor !== undefined &&
    !LighthouseFormFactorSchema.safeParse(options.formFactor).success
  ) {
    ctx.error(
      ctx.pc.red(
        `Invalid form-factor "${options.formFactor}": must be "mobile" or "desktop"`,
      ),
    );
    ctx.exit(1);
    return false;
  }

  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit < 0)
  ) {
    ctx.error(
      ctx.pc.red(
        `Invalid limit "${options.limit}": must be a non-negative integer`,
      ),
    );
    ctx.exit(1);
    return false;
  }

  return true;
}

/**
 * Executes the `devtools lighthouse list` command, listing recent audit runs from SQLite.
 *
 * @param options - Parsed CLI list options.
 * @param deps - Injected dependencies for hermetic testing.
 */
export async function runLighthouseListCommand(
  options: LighthouseListCommandOptions = {},
  deps?: LighthouseListCommandDeps,
): Promise<void> {
  const ctx = createLighthouseCliContext(options, deps);
  const db = await connectRequiredLighthouseDb(ctx);
  if (!db || !validateListOptions(options, ctx)) {
    return;
  }

  const listRuns =
    deps?.listRuns ?? (await import("@devtools/lighthouse")).listLighthouseRuns;

  try {
    const runs = listRuns(db, {
      url: options.url,
      formFactor: options.formFactor,
      limit: options.limit ?? 10,
    });

    ctx.log(options.json ? formatJson(runs) : formatTerminalList(runs));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.error(ctx.pc.red(`Error retrieving audit runs: ${message}`));
    ctx.exit(1);
  }
}
