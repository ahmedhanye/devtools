import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Raw LCOV report content paired with the workspace base directory from which its relative `SF:` paths resolve.
 */
export interface LcovEntry {
  /** Raw LCOV text content read from a workspace `lcov.info` file. */
  content: string;
  /** Absolute path to the workspace directory anchoring relative `SF:` records. */
  baseDir: string;
}

/**
 * Normalizes a single LCOV line, converting `SF:` source file entries to repository-relative forward-slash paths.
 */
function normalizeLcovLine(
  line: string,
  baseDir: string,
  repoRoot: string,
): string {
  if (!line.startsWith("SF:")) {
    return line;
  }
  const rawPath = line.slice(3).trim();
  const absPath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(baseDir, rawPath);
  const relPath = path.relative(repoRoot, absPath).replace(/\\/g, "/");
  return `SF:${relPath}`;
}

/**
 * Normalizes all `SF:` paths in LCOV content to be repository-relative using forward slashes.
 *
 * @param entryOrContent - Either an {@link LcovEntry} object or raw LCOV content string.
 * @param baseDirOrRepoRoot - When `entryOrContent` is a string, the workspace base directory; when an {@link LcovEntry}, the repository root.
 * @param maybeRepoRoot - Repository root path when `entryOrContent` is a raw string.
 * @returns LCOV string with all `SF:` records rewritten relative to `repoRoot`.
 */
export function normalizeLcovPaths(
  entryOrContent: LcovEntry | string,
  baseDirOrRepoRoot?: string,
  maybeRepoRoot?: string,
): string {
  const isEntryObj =
    typeof entryOrContent === "object" && entryOrContent !== null;
  const lcovContent = isEntryObj ? entryOrContent.content : entryOrContent;
  const baseDir = isEntryObj
    ? entryOrContent.baseDir
    : (baseDirOrRepoRoot ?? process.cwd());
  const repoRoot = isEntryObj
    ? (baseDirOrRepoRoot ?? process.cwd())
    : (maybeRepoRoot ?? process.cwd());

  if (!lcovContent || !lcovContent.trim()) {
    return "";
  }

  return lcovContent
    .split("\n")
    .map((line) => normalizeLcovLine(line, baseDir, repoRoot))
    .join("\n");
}

/**
 * Merges multiple workspace {@link LcovEntry} records into a single unified LCOV string with normalized paths.
 *
 * @param entries - Array of workspace LCOV entries to normalize and concatenate.
 * @param repoRoot - Absolute path to the monorepo root directory.
 * @returns Combined LCOV report string (ending with a newline when non-empty).
 */
export function mergeLcovContents(
  entries: LcovEntry[],
  repoRoot: string,
): string {
  if (!entries || entries.length === 0) {
    return "";
  }

  const mergedChunks: string[] = [];
  for (const entry of entries) {
    const normalized = normalizeLcovPaths(entry, repoRoot).trim();
    if (normalized) {
      mergedChunks.push(normalized);
    }
  }

  return mergedChunks.length === 0 ? "" : mergedChunks.join("\n") + "\n";
}

/**
 * Configuration options for {@link collectCoverage}.
 */
export interface CollectCoverageOptions {
  /** Monorepo root directory. Defaults to `process.cwd()`. */
  repoRoot?: string;
  /** Output directory for the merged `lcov.info` report. Defaults to `<repoRoot>/coverage`. */
  outputDir?: string;
  /** Whether to delete existing workspace coverage directories before running tests. */
  cleanPriorReports?: boolean;
  /** Injectable process spawner seam for unit testing without running full test suites. */
  spawnCommand?: (
    cmd: string,
    args: string[],
    options: { cwd: string; stdio?: string },
  ) => { status: number | null };
}

type SpawnFn = NonNullable<CollectCoverageOptions["spawnCommand"]>;

const BUN_WORKSPACES = [
  "packages/core",
  "packages/db",
  "packages/browser",
  "packages/lighthouse",
  "apps/cli",
  "apps/api",
  "site",
] as const;

const IGNORED_SCAN_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".source",
  "dist",
]);

/**
 * Runs `bun test --coverage --coverage-reporter=lcov` inside a target directory.
 */
function runBunCoverage(
  cwd: string,
  extraArgs: string[],
  spawnFn: SpawnFn,
): void {
  const args = ["test", "--coverage", "--coverage-reporter=lcov", ...extraArgs];
  const res = spawnFn("bun", args, { cwd, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`Test suite failed in ${cwd} with exit code ${res.status}`);
  }
}

/**
 * Removes prior coverage artifacts across all workspaces before a clean run.
 */
function cleanCoverageArtifacts(root: string, mergedLcovPath: string): void {
  for (const pkg of BUN_WORKSPACES) {
    fs.rmSync(path.join(root, pkg, "coverage"), {
      recursive: true,
      force: true,
    });
  }
  fs.rmSync(path.join(root, "coverage/scripts"), {
    recursive: true,
    force: true,
  });
  fs.rmSync(path.join(root, "apps/frontend/coverage"), {
    recursive: true,
    force: true,
  });
  fs.rmSync(path.join(path.dirname(mergedLcovPath), "coverage-final.json"), {
    force: true,
  });
  fs.rmSync(mergedLcovPath, { force: true });
}

/**
 * Filters raw LCOV records to prevent cross-workspace relative paths from polluting a workspace's report.
 */
function filterWorkspaceLcovRecords(
  content: string,
  isScripts: boolean,
): string {
  const records = content.split("end_of_record\n");
  const matchingRecords = records.filter((rec) => {
    const sfMatch = rec.match(/SF:(.+)/);
    if (!sfMatch?.[1]) return false;
    const p = sfMatch[1].trim();
    return isScripts
      ? p.startsWith("scripts/") || p.startsWith("./scripts/")
      : !p.startsWith("../") && !p.startsWith("..\\");
  });

  return matchingRecords.length > 0
    ? matchingRecords.map((r) => r.trimEnd()).join("\nend_of_record\n") +
        "\nend_of_record\n"
    : "";
}

/**
 * Recursively discovers all workspace `lcov.info` files under `dir` (excluding `mergedLcovPath`).
 */
function discoverLcovEntries(
  dir: string,
  root: string,
  mergedLcovPath: string,
  lcovEntries: LcovEntry[],
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_SCAN_DIRS.has(entry.name)) {
        discoverLcovEntries(fullPath, root, mergedLcovPath, lcovEntries);
      }
      continue;
    }
    if (
      entry.isFile() &&
      entry.name === "lcov.info" &&
      fullPath !== mergedLcovPath
    ) {
      const content = fs.readFileSync(fullPath, "utf8");
      const parentDir = path.dirname(fullPath);
      const isScripts = parentDir.endsWith("coverage/scripts");
      const workspaceDir = isScripts ? root : path.dirname(parentDir);
      lcovEntries.push({
        content: filterWorkspaceLcovRecords(content, isScripts),
        baseDir: workspaceDir,
      });
    }
  }
}

/**
 * Executes test suites with coverage across all monorepo workspaces (`packages/*`, `apps/*`, `site`, `scripts/`)
 * and merges the resulting LCOV reports into `coverage/lcov.info`.
 *
 * @param options - Optional repository root, output directory, cleanup flag, and command spawner seam.
 * @returns Object containing `mergedCount` (number of LCOV files combined) and `outputPath`.
 * @throws {Error} When any workspace test suite or `fumadocs-mdx` codegen step exits with a non-zero status.
 */
export async function collectCoverage(
  options: CollectCoverageOptions = {},
): Promise<{ mergedCount: number; outputPath: string }> {
  const root = options.repoRoot ?? process.cwd();
  const mergedLcovDir = options.outputDir ?? path.join(root, "coverage");
  const mergedLcovPath = path.join(mergedLcovDir, "lcov.info");

  const spawnCommand: SpawnFn =
    options.spawnCommand ??
    ((cmd, args, opts) =>
      spawnSync(cmd, args, {
        cwd: opts.cwd,
        stdio: (opts.stdio as "inherit" | "pipe") ?? "inherit",
      }));

  if (options.cleanPriorReports) {
    cleanCoverageArtifacts(root, mergedLcovPath);
  }

  fs.mkdirSync(mergedLcovDir, { recursive: true });

  for (const pkg of BUN_WORKSPACES) {
    const pkgDir = path.join(root, pkg);
    if (!fs.existsSync(pkgDir)) continue;

    if (pkg === "site") {
      console.log(`Running fumadocs-mdx codegen for ${pkg}...`);
      const preRes = spawnCommand("bunx", ["fumadocs-mdx"], {
        cwd: pkgDir,
        stdio: "inherit",
      });
      if (preRes.status !== 0) {
        throw new Error(
          `fumadocs-mdx failed in ${pkgDir} with exit code ${preRes.status}`,
        );
      }
    }
    console.log(`Running coverage for ${pkg}...`);
    runBunCoverage(pkgDir, ["--coverage-dir=coverage"], spawnCommand);
  }

  console.log("Running coverage for scripts/...");
  runBunCoverage(
    root,
    ["--coverage-dir=coverage/scripts", "scripts/"],
    spawnCommand,
  );

  if (fs.existsSync(path.join(root, "apps/frontend"))) {
    console.log("Running coverage for apps/frontend (Vitest)...");
    const frontendRes = spawnCommand(
      "bun",
      ["--filter", "@devtools/frontend", "test", "--", "--coverage"],
      { cwd: root, stdio: "inherit" },
    );
    if (frontendRes.status !== 0) {
      throw new Error(
        `Vitest coverage failed for apps/frontend with exit code ${frontendRes.status}`,
      );
    }
  }

  const lcovEntries: LcovEntry[] = [];
  discoverLcovEntries(root, root, mergedLcovPath, lcovEntries);

  const unifiedLcov = mergeLcovContents(lcovEntries, root);
  fs.writeFileSync(mergedLcovPath, unifiedLcov, "utf8");
  console.log(
    `Successfully merged ${lcovEntries.length} coverage files into ${mergedLcovPath}`,
  );

  return {
    mergedCount: lcovEntries.length,
    outputPath: mergedLcovPath,
  };
}

if (import.meta.main) {
  collectCoverage({ cleanPriorReports: true }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
