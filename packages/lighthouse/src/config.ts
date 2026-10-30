import { existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { EnvMap } from "@devtools/core";
import { findWorkspaceRoot } from "@devtools/db";

export { findWorkspaceRoot };

/**
 * Configuration seam options for {@link resolveArtifactsDir}.
 *
 * @remarks
 * Allows callers and unit tests to inject an explicit directory, working directory
 * provider, or isolated environment variable map without mutating `process.env`.
 */
export interface ResolveArtifactsDirOptions {
  /** Explicit filesystem directory override. */
  customDir?: string;
  /** Isolated environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Callback returning the simulated current working directory. */
  cwd?: () => string;
}

/**
 * Ensures the target directory exists on disk by creating it recursively when missing.
 */
function ensureDirectory(dirPath: string): string {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Normalizes the overloaded arguments accepted by {@link resolveArtifactsDir}.
 */
function normalizeArtifactsInput(
  customDirOrOptions?: string | ResolveArtifactsDirOptions,
  maybeEnv?: EnvMap,
): { customDir?: string; env: EnvMap; cwd: string } {
  if (typeof customDirOrOptions === "object" && customDirOrOptions !== null) {
    return {
      customDir: customDirOrOptions.customDir,
      env: customDirOrOptions.env ?? process.env,
      cwd: customDirOrOptions.cwd ? customDirOrOptions.cwd() : process.cwd(),
    };
  }
  return {
    customDir: customDirOrOptions,
    env: maybeEnv ?? process.env,
    cwd: process.cwd(),
  };
}

/**
 * Resolves the target directory for cold Lighthouse Report Artifacts (`report.json` and `report.html`)
 * using a 4-tier precedence waterfall:
 *
 * 1. Explicit `customDir` argument or `DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR` environment variable.
 * 2. Ephemeral test directory (`<tmpdir>/devtools-tests/lighthouse`) when `NODE_ENV` or `BUN_ENV` is `"test"`.
 * 3. Workspace-anchored `.devtools/artifacts/lighthouse` when `NODE_ENV !== "production"`.
 * 4. User home directory `~/.devtools/artifacts/lighthouse` in production.
 *
 * @remarks
 * Automatically creates the resolved directory on disk.
 *
 * @param customDirOrOptions - Optional explicit directory string or {@link ResolveArtifactsDirOptions} seam object.
 * @param maybeEnv - Optional environment map when the first argument is a directory path string.
 * @returns Resolved absolute filesystem path to the Lighthouse artifacts directory.
 */
export function resolveArtifactsDir(
  customDirOrOptions?: string | ResolveArtifactsDirOptions,
  maybeEnv?: EnvMap,
): string {
  const {
    customDir,
    env: currentEnv,
    cwd,
  } = normalizeArtifactsInput(customDirOrOptions, maybeEnv);

  const rawOverride =
    customDir?.trim() || currentEnv.DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR?.trim();
  if (rawOverride && rawOverride.length > 0) {
    return ensureDirectory(resolve(cwd, rawOverride));
  }

  if (currentEnv.NODE_ENV === "test" || currentEnv.BUN_ENV === "test") {
    return ensureDirectory(join(tmpdir(), "devtools-tests", "lighthouse"));
  }

  if (currentEnv.NODE_ENV !== "production") {
    const root = findWorkspaceRoot(cwd) ?? cwd;
    return ensureDirectory(
      resolve(root, ".devtools", "artifacts", "lighthouse"),
    );
  }

  return ensureDirectory(
    join(homedir(), ".devtools", "artifacts", "lighthouse"),
  );
}

/**
 * Configuration seam options for resolving Chromium sandbox behavior.
 */
export interface ResolveChromeSandboxOptions {
  /** Explicit override to disable or keep sandbox. */
  disableSandbox?: boolean;
  /** Environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Custom user ID retriever for unit testing (defaults to `process.getuid`). */
  getuid?: () => number;
}

/**
 * Determines whether Chromium `--no-sandbox` flag should be applied.
 *
 * @remarks
 * In root environments (`uid 0`), continuous integration environments (`CI=true`),
 * or when `CHROME_NO_SANDBOX=1` is configured, `--no-sandbox` is required for Chromium
 * to launch without SUID or unprivileged user namespace sandbox failures.
 * In desktop non-root sessions, sandboxing remains enabled by default.
 *
 * @param options - Explicit override, environment map, and user ID seam.
 * @returns True if `--no-sandbox` should be passed to Chromium.
 */
export function resolveChromeSandboxDisabled(
  options: ResolveChromeSandboxOptions = {},
): boolean {
  if (typeof options.disableSandbox === "boolean") {
    return options.disableSandbox;
  }
  const currentEnv = options.env ?? process.env;
  if (
    currentEnv.CHROME_NO_SANDBOX === "1" ||
    currentEnv.CHROME_NO_SANDBOX === "true" ||
    currentEnv.CI === "true" ||
    currentEnv.CI === "1"
  ) {
    return true;
  }
  const uidResolver =
    options.getuid ??
    (typeof process.getuid === "function"
      ? () => process.getuid!()
      : undefined);
  if (typeof uidResolver === "function" && uidResolver() === 0) {
    return true;
  }
  return false;
}
