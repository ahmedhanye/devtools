import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Checks whether a `package.json` file declares monorepo workspaces.
 */
function hasWorkspacesConfig(pkgPath: string): boolean {
  if (!existsSync(pkgPath)) {
    return false;
  }
  try {
    const content = readFileSync(pkgPath, "utf-8");
    const parsed: unknown = JSON.parse(content);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "workspaces" in parsed &&
      Boolean(parsed.workspaces)
    );
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
 * Detects whether the current process is executing from a compiled standalone
 * single-file Bun executable (`bun build --compile`).
 *
 * @param override - Optional explicit boolean override for hermetic testing.
 * @returns `true` when running as a compiled standalone binary.
 */
export function isStandaloneRuntime(override?: boolean): boolean {
  return override ?? Bun.isStandaloneExecutable;
}
