import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { EnvMap } from "@devtools/core";
import { findWorkspaceRoot, isStandaloneRuntime } from "@devtools/core/node";

/**
 * Configuration seam options for {@link resolveDatabasePath}.
 *
 * @remarks
 * Allows callers and unit tests to inject an explicit path, isolated environment
 * variable map, working directory provider, or standalone runtime flag without
 * mutating global process state.
 */
export interface ResolveDatabasePathOptions {
  /** Explicit filesystem path or `":memory:"` override. */
  customPath?: string;
  /** Force an isolated in-memory database (`":memory:"`), overriding environment and path defaults. */
  memory?: boolean;
  /** Isolated environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Optional working directory getter seam overriding `process.cwd()`. */
  cwd?: () => string;
  /** Optional standalone binary runtime seam overriding `Bun.isStandaloneExecutable`. */
  isStandalone?: boolean;
}

/**
 * Ensures the parent directory of a file-backed SQLite database exists on disk.
 *
 * @remarks
 * `bun:sqlite` throws `SQLITE_CANTOPEN` when opening a database file whose parent
 * directory has not been created yet.
 */
export function ensureParentDirectory(filePath: string): string {
  if (filePath === ":memory:") return filePath;
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return filePath;
}

/**
 * Normalizes the overloaded arguments accepted by {@link resolveDatabasePath}.
 */
function normalizeResolutionInput(
  customPathOrOptions?: string | ResolveDatabasePathOptions,
  maybeEnv?: EnvMap,
): {
  customPath?: string;
  memory?: boolean;
  env: EnvMap;
  cwd?: () => string;
  isStandalone?: boolean;
} {
  if (typeof customPathOrOptions === "object" && customPathOrOptions !== null) {
    return {
      customPath: customPathOrOptions.customPath,
      memory: customPathOrOptions.memory,
      env: customPathOrOptions.env ?? process.env,
      cwd: customPathOrOptions.cwd,
      isStandalone: customPathOrOptions.isStandalone,
    };
  }
  return {
    customPath: customPathOrOptions,
    env: maybeEnv ?? process.env,
  };
}

/**
 * Computes the resolved SQLite database target path without creating directories on disk.
 *
 * @param customPathOrOptions - Optional explicit path string or {@link ResolveDatabasePathOptions} seam object.
 * @param maybeEnv - Optional environment map when the first argument is a path string.
 * @returns Resolved absolute filesystem path to the SQLite database file, or `":memory:"`.
 */
export function resolveDatabaseTargetPath(
  customPathOrOptions?: string | ResolveDatabasePathOptions,
  maybeEnv?: EnvMap,
): string {
  const {
    customPath,
    memory,
    env: currentEnv,
    cwd: customCwd,
    isStandalone,
  } = normalizeResolutionInput(customPathOrOptions, maybeEnv);

  if (memory === true) {
    return ":memory:";
  }

  const currentCwd = customCwd ? customCwd() : process.cwd();

  // 1. Explicit override via argument or environment variable
  const envPath =
    customPath ?? currentEnv.DEVTOOLS_DB_PATH ?? currentEnv.DATABASE_URL;
  if (envPath) {
    return envPath === ":memory:" ? ":memory:" : resolve(currentCwd, envPath);
  }

  // 2. Automated test environment
  if (currentEnv.NODE_ENV === "test" || currentEnv.BUN_ENV === "test") {
    return ":memory:";
  }

  // 3. Standalone compiled executable or production default: ~/.devtools/devtools.db
  if (
    isStandaloneRuntime(isStandalone) ||
    currentEnv.NODE_ENV === "production"
  ) {
    return join(homedir(), ".devtools", "devtools.db");
  }

  // 4. Local Development (in-repo database anchored to workspace root)
  const root = findWorkspaceRoot(currentCwd) ?? currentCwd;
  return resolve(root, ".devtools", "devtools.db");
}

/**
 * Resolves the target SQLite database path using a 4-tier precedence waterfall:
 *
 * 1. In-memory (`":memory:"`) when `memory: true` is set, or explicit `customPath`,
 *    `DEVTOOLS_DB_PATH`, or `DATABASE_URL` environment variable override.
 * 2. In-memory database (`":memory:"`) when `NODE_ENV` or `BUN_ENV` is `"test"`.
 * 3. User home directory `~/.devtools/devtools.db` in compiled standalone binaries or production.
 * 4. Workspace-anchored `.devtools/devtools.db` in local development.
 *
 * @remarks
 * Automatically creates the parent directory for file-backed database paths.
 *
 * @param customPathOrOptions - Optional explicit path string or {@link ResolveDatabasePathOptions} seam object.
 * @param maybeEnv - Optional environment map when the first argument is a path string.
 * @returns Resolved absolute filesystem path to the SQLite database file, or `":memory:"`.
 */
export function resolveDatabasePath(
  customPathOrOptions?: string | ResolveDatabasePathOptions,
  maybeEnv?: EnvMap,
): string {
  return ensureParentDirectory(
    resolveDatabaseTargetPath(customPathOrOptions, maybeEnv),
  );
}
