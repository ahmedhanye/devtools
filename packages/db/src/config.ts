import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface DatabaseConfig {
  path: string;
  isMemory: boolean;
}

export interface ResolveDatabasePathOptions {
  customPath?: string;
  env?: Record<string, string | undefined>;
}

/**
 * Walks up from startDir to discover the monorepo workspace root
 * by looking for .git or a package.json containing "workspaces".
 */
export function findWorkspaceRoot(
  startDir: string = process.cwd(),
): string | null {
  let current = resolve(startDir);
  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    const pkgPath = join(current, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const content = readFileSync(pkgPath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed && parsed.workspaces) {
          return current;
        }
      } catch {
        // Ignore read/parse errors
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

/**
 * Ensures the parent directory of the database file exists.
 * bun:sqlite throws SQLITE_CANTOPEN if parent directory is missing.
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
 * Resolves the database file path based on environment variables and execution context.
 * Supports an explicit env seam to guarantee test isolation without mutating global process.env.
 */
export function resolveDatabasePath(
  customPathOrOptions?: string | ResolveDatabasePathOptions,
  maybeEnv?: Record<string, string | undefined>,
): string {
  let customPath: string | undefined;
  let env: Record<string, string | undefined> | undefined;

  if (typeof customPathOrOptions === "object" && customPathOrOptions !== null) {
    customPath = customPathOrOptions.customPath;
    env = customPathOrOptions.env;
  } else {
    customPath = customPathOrOptions;
    env = maybeEnv;
  }

  const currentEnv = env ?? process.env;

  // 1. Explicit override via argument or environment variable
  const envPath =
    customPath ?? currentEnv.DEVTOOLS_DB_PATH ?? currentEnv.DATABASE_URL;
  if (envPath) {
    if (envPath === ":memory:") return ":memory:";
    return ensureParentDirectory(resolve(process.cwd(), envPath));
  }

  // 2. Automated test environment
  if (currentEnv.NODE_ENV === "test" || currentEnv.BUN_ENV === "test") {
    return ":memory:";
  }

  // 3. Local Development (Django-style in-repo database anchored to workspace root)
  if (currentEnv.NODE_ENV !== "production") {
    const root = findWorkspaceRoot() ?? process.cwd();
    const devDbPath = resolve(root, ".devtools", "devtools.db");
    return ensureParentDirectory(devDbPath);
  }

  // 4. Production default: User's home directory (~/.devtools/devtools.db)
  const prodDbPath = join(homedir(), ".devtools", "devtools.db");
  return ensureParentDirectory(prodDbPath);
}
