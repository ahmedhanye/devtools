import { existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { EnvMap } from "@devtools/core";
import { findWorkspaceRoot, isStandaloneRuntime } from "@devtools/core/node";

/**
 * Configuration seam options for {@link resolveArtifactsDir}.
 *
 * @remarks
 * Allows callers and unit tests to inject an explicit directory, working directory
 * provider, standalone runtime flag, or isolated environment variable map without mutating `process.env`.
 */
export interface ResolveArtifactsDirOptions {
  /** Explicit filesystem directory override. */
  customDir?: string;
  /** Isolated environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Callback returning the simulated current working directory. */
  cwd?: () => string;
  /** Optional standalone binary runtime seam overriding `Bun.isStandaloneExecutable`. */
  isStandalone?: boolean;
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
): {
  customDir?: string;
  env: EnvMap;
  cwd: string;
  isStandalone?: boolean;
} {
  if (typeof customDirOrOptions === "object" && customDirOrOptions !== null) {
    return {
      customDir: customDirOrOptions.customDir,
      env: customDirOrOptions.env ?? process.env,
      cwd: customDirOrOptions.cwd ? customDirOrOptions.cwd() : process.cwd(),
      isStandalone: customDirOrOptions.isStandalone,
    };
  }
  return {
    customDir: customDirOrOptions,
    env: maybeEnv ?? process.env,
    cwd: process.cwd(),
  };
}

/**
 * Resolves the target directory path for cold Lighthouse Report Artifacts (`report.json` and `report.html`)
 * without creating directories on disk.
 *
 * Uses a 4-tier precedence waterfall:
 * 1. Explicit `customDir` argument or `DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR` environment variable.
 * 2. Ephemeral test directory (`<tmpdir>/devtools-tests/lighthouse`) when `NODE_ENV` or `BUN_ENV` is `"test"`.
 * 3. User home directory `~/.devtools/artifacts/lighthouse` in compiled standalone binaries or production.
 * 4. Workspace-anchored `.devtools/artifacts/lighthouse` in local development.
 *
 * @param customDirOrOptions - Optional explicit directory string or {@link ResolveArtifactsDirOptions} seam object.
 * @param maybeEnv - Optional environment map when the first argument is a directory path string.
 * @returns Resolved absolute filesystem path to the Lighthouse artifacts directory.
 */
export function resolveArtifactsTargetDir(
  customDirOrOptions?: string | ResolveArtifactsDirOptions,
  maybeEnv?: EnvMap,
): string {
  const {
    customDir,
    env: currentEnv,
    cwd,
    isStandalone,
  } = normalizeArtifactsInput(customDirOrOptions, maybeEnv);

  const rawOverride =
    customDir?.trim() || currentEnv.DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR?.trim();
  if (rawOverride && rawOverride.length > 0) {
    return resolve(cwd, rawOverride);
  }

  if (currentEnv.NODE_ENV === "test" || currentEnv.BUN_ENV === "test") {
    return join(tmpdir(), "devtools-tests", "lighthouse");
  }

  if (
    isStandaloneRuntime(isStandalone) ||
    currentEnv.NODE_ENV === "production"
  ) {
    return join(homedir(), ".devtools", "artifacts", "lighthouse");
  }

  const root = findWorkspaceRoot(cwd) ?? cwd;
  return resolve(root, ".devtools", "artifacts", "lighthouse");
}

/**
 * Resolves and ensures the target directory for cold Lighthouse Report Artifacts
 * (`report.json` and `report.html`) exists on disk.
 *
 * @remarks
 * Automatically creates the resolved directory on disk. Call
 * {@link resolveArtifactsTargetDir} on read-only paths to avoid creating directories.
 *
 * @param customDirOrOptions - Optional explicit directory string or {@link ResolveArtifactsDirOptions} seam object.
 * @param maybeEnv - Optional environment map when the first argument is a directory path string.
 * @returns Resolved absolute filesystem path to the Lighthouse artifacts directory.
 */
export function resolveArtifactsDir(
  customDirOrOptions?: string | ResolveArtifactsDirOptions,
  maybeEnv?: EnvMap,
): string {
  return ensureDirectory(
    resolveArtifactsTargetDir(customDirOrOptions, maybeEnv),
  );
}

/**
 * Resolves the canonical filesystem path of `artifactsDir`, or `null` when it
 * does not exist or cannot be resolved via `realpathSync`.
 *
 * @param artifactsDir - Configured Lighthouse artifacts root directory.
 * @returns Canonical absolute path or `null` if unavailable on disk.
 */
export function resolveCanonicalArtifactsDir(
  artifactsDir: string,
): string | null {
  try {
    return realpathSync(resolve(artifactsDir));
  } catch {
    return null;
  }
}

/**
 * Resolves and verifies that an HTML report path exists as a regular file strictly
 * inside `artifactsDir` after canonical symlink resolution.
 *
 * @param htmlReportPath - Stored `html_report_path` value from SQLite.
 * @param artifactsDir - Canonical artifacts root directory.
 * @param preResolvedCanonicalBase - Optional canonical path from {@link resolveCanonicalArtifactsDir} to hoist repeated lookups across rows.
 * @returns Canonical filesystem path if confined and readable as a file, or `null` otherwise.
 */
export function resolveSafeHtmlReportPath(
  htmlReportPath: string,
  artifactsDir: string,
  preResolvedCanonicalBase?: string | null,
): string | null {
  if (!htmlReportPath) {
    return null;
  }
  const canonicalBase =
    preResolvedCanonicalBase !== undefined
      ? preResolvedCanonicalBase
      : resolveCanonicalArtifactsDir(artifactsDir);
  if (canonicalBase === null) {
    return null;
  }
  try {
    const canonicalTarget = realpathSync(resolve(htmlReportPath));
    if (!canonicalTarget.startsWith(canonicalBase + sep)) {
      return null;
    }
    return statSync(canonicalTarget).isFile() ? canonicalTarget : null;
  } catch {
    return null;
  }
}
