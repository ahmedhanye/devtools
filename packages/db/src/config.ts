import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { EnvMap } from "@devtools/core";

/**
 * Configuration seam options for {@link resolveDatabasePath}.
 *
 * @remarks
 * Allows callers and unit tests to inject an explicit path or isolated environment
 * variable map without mutating the global `process.env` object.
 */
export interface ResolveDatabasePathOptions {
  /** Explicit filesystem path or `":memory:"` override. */
  customPath?: string;
  /** Isolated environment variable map overriding `process.env`. */
  env?: EnvMap;
}

/**
 * Checks whether a `package.json` file declares monorepo workspaces.
 */
function hasWorkspacesConfig(pkgPath: string): boolean {
  if (!existsSync(pkgPath)) {
    return false;
  }
  try {
    const content = readFileSync(pkgPath, "utf-8");
    const parsed = JSON.parse(content) as { workspaces?: unknown } | null;
    return Boolean(parsed && parsed.workspaces);
  } catch {
    return false;
  }
}

/**
 * Walks upward from `startDir` to discover the monorepo workspace root
 * by checking for a `.git` entry or a `package.json` containing `"workspaces"`.
 *
 * @param startDir - Directory from which upward traversal begins. Defaults to `process.cwd()`.
 * @returns Absolute path to the workspace root, or `null` if the filesystem root is reached without a match.
 */
export function findWorkspaceRoot(
  startDir: string = process.cwd(),
): string | null {
  let current = resolve(startDir);
  while (true) {
    if (
      existsSync(join(current, ".git")) ||
      hasWorkspacesConfig(join(current, "package.json"))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Ensures the parent directory of a file-backed SQLite database exists on disk.
 *
 * @remarks
 * `bun:sqlite` throws `SQLITE_CANTOPEN` when opening a database file whose parent
 * directory has not been created yet.
 */
function ensureParentDirectory(filePath: string): string {
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
): { customPath?: string; env: EnvMap } {
  if (typeof customPathOrOptions === "object" && customPathOrOptions !== null) {
    return {
      customPath: customPathOrOptions.customPath,
      env: customPathOrOptions.env ?? process.env,
    };
  }
  return {
    customPath: customPathOrOptions,
    env: maybeEnv ?? process.env,
  };
}

/**
 * Resolves the target SQLite database path using a 4-tier precedence waterfall:
 *
 * 1. Explicit `customPath` argument, `DEVTOOLS_DB_PATH`, or `DATABASE_URL` environment variable.
 * 2. In-memory database (`":memory:"`) when `NODE_ENV` or `BUN_ENV` is `"test"`.
 * 3. Workspace-anchored `.devtools/devtools.db` when `NODE_ENV !== "production"`.
 * 4. User home directory `~/.devtools/devtools.db` in production.
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
  const { customPath, env: currentEnv } = normalizeResolutionInput(
    customPathOrOptions,
    maybeEnv,
  );

  // 1. Explicit override via argument or environment variable
  const envPath =
    customPath ?? currentEnv.DEVTOOLS_DB_PATH ?? currentEnv.DATABASE_URL;
  if (envPath) {
    return envPath === ":memory:"
      ? ":memory:"
      : ensureParentDirectory(resolve(process.cwd(), envPath));
  }

  // 2. Automated test environment
  if (currentEnv.NODE_ENV === "test" || currentEnv.BUN_ENV === "test") {
    return ":memory:";
  }

  // 3. Local Development (Django-style in-repo database anchored to workspace root)
  if (currentEnv.NODE_ENV !== "production") {
    const root = findWorkspaceRoot() ?? process.cwd();
    return ensureParentDirectory(resolve(root, ".devtools", "devtools.db"));
  }

  // 4. Production default: User's home directory (~/.devtools/devtools.db)
  return ensureParentDirectory(join(homedir(), ".devtools", "devtools.db"));
}
