import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface LcovEntry {
  content: string;
  baseDir: string;
}

/**
 * Normalizes all SF: paths in LCOV content to be repository-relative.
 */
export function normalizeLcovPaths(
  entryOrContent: LcovEntry | string,
  baseDirOrRepoRoot?: string,
  maybeRepoRoot?: string,
): string {
  let lcovContent: string;
  let baseDir: string;
  let repoRoot: string;

  if (typeof entryOrContent === "object" && entryOrContent !== null) {
    lcovContent = entryOrContent.content;
    baseDir = entryOrContent.baseDir;
    repoRoot = baseDirOrRepoRoot ?? process.cwd();
  } else {
    lcovContent = entryOrContent;
    baseDir = baseDirOrRepoRoot ?? process.cwd();
    repoRoot = maybeRepoRoot ?? process.cwd();
  }

  if (!lcovContent || !lcovContent.trim()) {
    return "";
  }

  const lines = lcovContent.split("\n");
  const normalizedLines = lines.map((line) => {
    if (!line.startsWith("SF:")) {
      return line;
    }

    const rawPath = line.slice(3).trim();
    let absPath: string;

    if (path.isAbsolute(rawPath)) {
      absPath = rawPath;
    } else {
      absPath = path.resolve(baseDir, rawPath);
    }

    const relPath = path.relative(repoRoot, absPath).replace(/\\/g, "/");
    return `SF:${relPath}`;
  });

  return normalizedLines.join("\n");
}

/**
 * Merges multiple LCOV entries into a single unified LCOV string with normalized paths.
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

  if (mergedChunks.length === 0) {
    return "";
  }

  return mergedChunks.join("\n") + "\n";
}

export interface CollectCoverageOptions {
  repoRoot?: string;
  outputDir?: string;
  cleanPriorReports?: boolean;
  spawnCommand?: (
    cmd: string,
    args: string[],
    options: { cwd: string; stdio?: string },
  ) => { status: number | null };
}

/**
 * Runs Bun tests with coverage for a directory.
 */
function runBunCoverage(
  cwd: string,
  extraArgs: string[] = [],
  spawnFn: (
    cmd: string,
    args: string[],
    options: { cwd: string; stdio?: string },
  ) => { status: number | null } = (cmd, args, opts) =>
    spawnSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" }),
): void {
  const args = ["test", "--coverage", "--coverage-reporter=lcov", ...extraArgs];
  const res = spawnFn("bun", args, { cwd, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`Test suite failed in ${cwd} with exit code ${res.status}`);
  }
}

/**
 * Executes test suites with coverage across workspaces and merges the resulting LCOV files.
 */
export async function collectCoverage(
  options: CollectCoverageOptions = {},
): Promise<{ mergedCount: number; outputPath: string }> {
  const root = options.repoRoot ?? process.cwd();
  const mergedLcovDir = options.outputDir ?? path.join(root, "coverage");
  const mergedLcovPath = path.join(mergedLcovDir, "lcov.info");

  const spawnCommand =
    options.spawnCommand ??
    ((cmd, args, opts) =>
      spawnSync(cmd, args, {
        cwd: opts.cwd,
        stdio: (opts.stdio as "inherit" | "pipe") ?? "inherit",
      }));

  fs.mkdirSync(mergedLcovDir, { recursive: true });

  const bunWorkspaces = [
    "packages/core",
    "packages/db",
    "packages/browser",
    "apps/cli",
    "apps/api",
    "site",
  ];

  // Remove prior coverage artifacts before collection to prevent stale report merging when requested
  if (options.cleanPriorReports) {
    for (const pkg of bunWorkspaces) {
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
    fs.rmSync(mergedLcovPath, { force: true });
  }

  // 1. Run Bun tests with LCOV coverage on native packages and site
  for (const pkg of bunWorkspaces) {
    const pkgDir = path.join(root, pkg);
    if (fs.existsSync(pkgDir)) {
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
  }

  // 2. Run root scripts test coverage into coverage/scripts/ to avoid collision with final merged output
  console.log("Running coverage for scripts/...");
  runBunCoverage(
    root,
    ["--coverage-dir=coverage/scripts", "scripts/"],
    spawnCommand,
  );

  // 3. Run frontend Vitest coverage
  if (fs.existsSync(path.join(root, "apps/frontend"))) {
    console.log("Running coverage for apps/frontend (Vitest)...");
    const frontendRes = spawnCommand(
      "bun",
      ["--filter", "@devtools/frontend", "test", "--", "--coverage"],
      {
        cwd: root,
        stdio: "inherit",
      },
    );
    if (frontendRes.status !== 0) {
      throw new Error(
        `Vitest coverage failed for apps/frontend with exit code ${frontendRes.status}`,
      );
    }
  }

  // 4. Find all generated lcov.info files
  const lcovEntries: LcovEntry[] = [];

  function scanForLcov(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === ".next" ||
          entry.name === ".source"
        ) {
          continue;
        }
        scanForLcov(fullPath);
      } else if (entry.isFile() && entry.name === "lcov.info") {
        if (fullPath !== mergedLcovPath) {
          const content = fs.readFileSync(fullPath, "utf8");
          // The base directory for relative paths in this lcov file is typically the workspace root
          // i.e. two levels up from <workspace>/coverage/lcov.info (or root for scripts)
          const parentDir = path.dirname(fullPath);
          const isScripts = parentDir.endsWith("coverage/scripts");
          const workspaceDir = isScripts ? root : path.dirname(parentDir);
          let filteredContent = content;
          const records = content.split("end_of_record\n");
          if (isScripts) {
            const matchingRecords = records.filter((rec) => {
              const sfMatch = rec.match(/SF:(.+)/);
              if (!sfMatch) return false;
              const p = sfMatch[1]!.trim();
              return p.startsWith("scripts/") || p.startsWith("./scripts/");
            });
            filteredContent =
              matchingRecords.length > 0
                ? matchingRecords
                    .map((r) => r.trimEnd())
                    .join("\nend_of_record\n") + "\nend_of_record\n"
                : "";
          } else {
            // Workspace-scoped filter: avoid cross-workspace relative pollution (e.g. ../../packages/browser leaking into apps/cli coverage)
            const matchingRecords = records.filter((rec) => {
              const sfMatch = rec.match(/SF:(.+)/);
              if (!sfMatch) return false;
              const p = sfMatch[1]!.trim();
              return !p.startsWith("../") && !p.startsWith("..\\");
            });
            filteredContent =
              matchingRecords.length > 0
                ? matchingRecords
                    .map((r) => r.trimEnd())
                    .join("\nend_of_record\n") + "\nend_of_record\n"
                : "";
          }
          lcovEntries.push({ content: filteredContent, baseDir: workspaceDir });
        }
      }
    }
  }

  scanForLcov(root);

  const unifiedLcov = mergeLcovContents(lcovEntries, root);
  fs.writeFileSync(mergedLcovPath, unifiedLcov, "utf8");
  console.log(
    `Successfully merged ${lcovEntries.length} coverage files into ${mergedLcovPath}`,
  );

  const frontendIstanbulJson = path.join(
    root,
    "apps/frontend/coverage/coverage-final.json",
  );
  const targetIstanbulJson = path.join(mergedLcovDir, "coverage-final.json");
  if (fs.existsSync(frontendIstanbulJson)) {
    fs.copyFileSync(frontendIstanbulJson, targetIstanbulJson);
  }

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
