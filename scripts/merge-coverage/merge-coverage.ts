import fs from "node:fs";
import path from "node:path";

/** Raw LCOV report content paired with the workspace base directory from which its relative `SF:` paths resolve. */
export interface LcovEntry {
  content: string;
  baseDir: string;
}

const IGNORED_SCAN_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".source",
  ".turbo",
  "dist",
]);

/** Normalizes all `SF:` paths in an {@link LcovEntry} to be repository-relative using forward slashes. */
export function normalizeLcovPaths(entry: LcovEntry, repoRoot: string): string {
  if (!entry.content.trim()) {
    return "";
  }
  return entry.content
    .split("\n")
    .map((line) => {
      if (!line.startsWith("SF:")) {
        return line;
      }
      const rawPath = line.slice(3).trim();
      const absPath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(entry.baseDir, rawPath);
      const relPath = path.relative(repoRoot, absPath).replace(/\\/g, "/");
      return `SF:${relPath}`;
    })
    .join("\n");
}

/** Filters raw LCOV records to prevent cross-workspace relative paths from polluting a workspace's report. */
export function filterWorkspaceLcovRecords(
  content: string,
  isScripts: boolean,
): string {
  const matchingRecords = content.split("end_of_record\n").filter((rec) => {
    const sfMatch = rec.match(/SF:(.+)/);
    if (!sfMatch?.[1]) return false;
    const filePath = sfMatch[1].trim();
    return isScripts
      ? filePath.startsWith("scripts/") || filePath.startsWith("./scripts/")
      : !filePath.startsWith("../") && !filePath.startsWith("..\\");
  });

  return matchingRecords.length > 0
    ? `${matchingRecords.map((r) => r.trimEnd()).join("\nend_of_record\n")}\nend_of_record\n`
    : "";
}

/** Merges multiple workspace {@link LcovEntry} records into a single unified LCOV string. */
export function mergeLcovContents(
  entries: readonly LcovEntry[],
  repoRoot: string,
): string {
  const chunks = entries
    .map((entry) => normalizeLcovPaths(entry, repoRoot).trim())
    .filter(Boolean);
  return chunks.length === 0 ? "" : `${chunks.join("\n")}\n`;
}

/** Recursively discovers workspace `lcov.info` files under `dir`, excluding `mergedLcovPath`. */
export function discoverLcovEntries(
  dir: string,
  mergedLcovPath: string,
  repoRoot = dir,
  entries: LcovEntry[] = [],
): LcovEntry[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_SCAN_DIRS.has(entry.name)) {
        discoverLcovEntries(fullPath, mergedLcovPath, repoRoot, entries);
      }
      continue;
    }
    if (
      entry.isFile() &&
      entry.name === "lcov.info" &&
      fullPath !== mergedLcovPath
    ) {
      const parentDir = path.dirname(fullPath);
      const isScripts = parentDir.endsWith(path.join("coverage", "scripts"));
      entries.push({
        content: filterWorkspaceLcovRecords(
          fs.readFileSync(fullPath, "utf8"),
          isScripts,
        ),
        baseDir: isScripts ? repoRoot : path.dirname(parentDir),
      });
    }
  }
  return entries;
}

/** Discovers workspace LCOV files and writes the unified `coverage/lcov.info` report. */
export function mergeCoverage(
  options: { repoRoot?: string; outputDir?: string; allowEmpty?: boolean } = {},
): { mergedCount: number; outputPath: string } {
  const repoRoot = options.repoRoot ?? process.cwd();
  const outputDir = options.outputDir ?? path.join(repoRoot, "coverage");
  const outputPath = path.join(outputDir, "lcov.info");

  fs.mkdirSync(outputDir, { recursive: true });
  const entries = discoverLcovEntries(repoRoot, outputPath);
  const unified = mergeLcovContents(entries, repoRoot);
  if (!unified) {
    if (options.allowEmpty) {
      return { mergedCount: 0, outputPath };
    }
    throw new Error(
      `Coverage merge failed: no LCOV coverage data was found under ${repoRoot}.`,
    );
  }
  fs.writeFileSync(outputPath, unified, "utf8");
  return { mergedCount: entries.length, outputPath };
}

/** CLI runner for `merge-coverage.ts`. Returns exit code `0` on success or `1` on error. */
export function runMergeCoverageCli(
  argv: readonly string[] = process.argv.slice(2),
  options: { repoRoot?: string; outputDir?: string } = {},
): number {
  try {
    const allowEmpty = argv.includes("--allow-empty");
    const result = mergeCoverage({ ...options, allowEmpty });
    if (result.mergedCount > 0) {
      console.log(
        `Merged ${result.mergedCount} LCOV files into ${result.outputPath}`,
      );
    }
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[merge-coverage] FAILED: ${message}`);
    return 1;
  }
}

if (import.meta.main) process.exit(runMergeCoverageCli());
