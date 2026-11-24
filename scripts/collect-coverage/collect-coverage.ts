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
  /** Whether to delete existing coverage directories for the selected targets before running tests. */
  cleanPriorReports?: boolean;
  /** Optional subset of workspaces/targets to run (e.g. `["packages/lighthouse"]`). Runs all targets when omitted or empty. */
  workspaces?: readonly string[];
  /** Injectable process spawner seam for unit testing without running full test suites. */
  spawnCommand?: (
    cmd: string,
    args: string[],
    options: { cwd: string; stdio?: string },
  ) => { status: number | null };
}

/**
 * Git runner dependency seam for resolving changed files under `--changed`.
 */
export type GitRunner = (
  args: string[],
  cwd: string,
) => { status: number | null; stdout: string; stderr?: string };

/**
 * Parsed CLI invocation options for `collect-coverage.ts`.
 */
export interface CollectCoverageCliResult {
  /** Whether `-h` or `--help` was requested. */
  help: boolean;
  /** Normalized coverage targets explicitly passed or resolved from `--changed` (`undefined` means full monorepo). */
  workspaces?: string[];
  /** Non-empty when `--changed` matched zero coverage-tracked targets so the runner can skip gracefully. */
  emptyChangedSelection: boolean;
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

/** All supported coverage target identifiers in canonical repository-relative form. */
export const COVERAGE_TARGETS = [
  ...BUN_WORKSPACES,
  "scripts",
  "apps/frontend",
] as const;

/** Canonical coverage target identifier (`packages/*`, `apps/*`, `site`, or `scripts`). */
export type CoverageTarget = (typeof COVERAGE_TARGETS)[number];

const PACKAGE_NAME_ALIASES: Record<string, CoverageTarget> = {
  "@devtools/core": "packages/core",
  "@devtools/db": "packages/db",
  "@devtools/browser": "packages/browser",
  "@devtools/lighthouse": "packages/lighthouse",
  "@devtools/cli": "apps/cli",
  "@devtools/api": "apps/api",
  "@devtools/site": "site",
  "@devtools/frontend": "apps/frontend",
};

const USAGE_TEXT =
  "Usage: bun scripts/collect-coverage/collect-coverage.ts [options] [workspaces...]\n" +
  "\n" +
  "Options:\n" +
  "  --scope <workspace>  Include target workspace (repeatable; e.g. packages/lighthouse or @devtools/cli)\n" +
  "  --changed            Run only for workspaces touched in git diff against BASE_REF (default: origin/main) or working tree\n" +
  "  --base <ref>         Override git base ref used with --changed\n" +
  "  -h, --help           Show usage instructions\n" +
  `\nValid targets: ${COVERAGE_TARGETS.join(", ")}\n`;

const IGNORED_SCAN_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".source",
  "dist",
]);

/**
 * Normalizes a workspace argument (path, trailing slash, or `@devtools/<name>` package name)
 * to a canonical {@link CoverageTarget}.
 *
 * @param rawTarget - Raw CLI argument or option value specifying a coverage target.
 * @returns Canonical {@link CoverageTarget} path.
 * @throws {Error} When `rawTarget` does not map to a known workspace or `scripts`.
 */
export function normalizeCoverageTarget(rawTarget: string): CoverageTarget {
  const trimmed = rawTarget.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (trimmed in PACKAGE_NAME_ALIASES) {
    return PACKAGE_NAME_ALIASES[trimmed]!;
  }
  const withoutDotSlash = trimmed.startsWith("./") ? trimmed.slice(2) : trimmed;
  if ((COVERAGE_TARGETS as readonly string[]).includes(withoutDotSlash)) {
    return withoutDotSlash as CoverageTarget;
  }
  throw new Error(
    `Unknown coverage target "${rawTarget}". Valid targets: ${COVERAGE_TARGETS.join(", ")}`,
  );
}

/**
 * Maps a list of repository-relative modified file paths to unique {@link CoverageTarget} entries.
 *
 * @param files - Changed or untracked repository-relative file paths.
 * @returns Ordered array of unique matching {@link CoverageTarget} entries.
 */
export function resolveTargetsForFiles(
  files: readonly string[],
): CoverageTarget[] {
  const selected = new Set<CoverageTarget>();
  for (const rawFile of files) {
    const file = rawFile.trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!file) continue;
    for (const target of COVERAGE_TARGETS) {
      if (file === target || file.startsWith(`${target}/`)) {
        selected.add(target);
        break;
      }
    }
  }
  return Array.from(selected);
}

/**
 * Default synchronous git runner used when `--changed` resolves modified files.
 */
function defaultGitRunner(
  args: string[],
  cwd: string,
): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    status: res.status,
    stdout: typeof res.stdout === "string" ? res.stdout : "",
    stderr: typeof res.stderr === "string" ? res.stderr : "",
  };
}

function formatGitFailureDetail(result: {
  status: number | null;
  stdout: string;
  stderr?: string;
}): string {
  const output = (result.stderr ?? "").trim() || result.stdout.trim();
  return output || `exit code ${result.status ?? "unknown"}`;
}

/**
 * Queries committed, staged, unstaged, and untracked files relative to `baseRef` to infer changed targets.
 * Fails closed with an actionable error whenever git cannot inspect the base diff or working tree.
 */
function collectChangedFilePaths(
  repoRoot: string,
  baseRef: string,
  gitRunner: GitRunner,
): string[] {
  const collected = new Set<string>();
  const addLines = (out: string) => {
    for (const line of out.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) collected.add(trimmed);
    }
  };

  const branchDiff = gitRunner(
    ["diff", "--name-only", `${baseRef}...HEAD`],
    repoRoot,
  );
  if (branchDiff.status !== 0) {
    const cleanBase = baseRef.replace(/^origin\//, "");
    throw new Error(
      `Could not diff against "${baseRef}...HEAD" under --changed. ` +
        `Ensure the base ref exists locally (e.g. run "git fetch origin ${cleanBase}" or pass "--base <ref>").\n` +
        `Git error: ${formatGitFailureDetail(branchDiff)}`,
    );
  }
  addLines(branchDiff.stdout);

  const workingTreeCommands: string[][] = [
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ];

  for (const args of workingTreeCommands) {
    const result = gitRunner(args, repoRoot);
    if (result.status !== 0) {
      throw new Error(
        `Failed to inspect working tree changes with "git ${args.join(" ")}" under --changed.\n` +
          `Git error: ${formatGitFailureDetail(result)}`,
      );
    }
    addLines(result.stdout);
  }

  return Array.from(collected);
}

/**
 * Parses CLI arguments for `collect-coverage.ts`, supporting workspace positional arguments,
 * `--scope <target>`, `--changed`, `--base <ref>`, and `-h`/`--help`.
 *
 * @param args - CLI arguments excluding `bun` and script path.
 * @param options - Optional repository root, environment map, and git runner seam.
 * @returns Parsed {@link CollectCoverageCliResult}.
 * @throws {Error} When an unknown flag, missing flag value, unknown workspace target, or `--changed` git failure occurs.
 */
export function parseCollectCoverageCliArgs(
  args: readonly string[],
  options: {
    repoRoot?: string;
    env?: Record<string, string | undefined>;
    gitRunner?: GitRunner;
  } = {},
): CollectCoverageCliResult {
  const repoRoot = options.repoRoot ?? process.cwd();
  const env = options.env ?? process.env;
  const gitRunner = options.gitRunner ?? defaultGitRunner;

  let baseRef = env.BASE_REF || "origin/main";
  let useChanged = false;
  const explicitTargets: CoverageTarget[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "-h" || arg === "--help") {
      return { help: true, emptyChangedSelection: false };
    }
    if (arg === "--changed") {
      useChanged = true;
      continue;
    }
    if (arg === "--base") {
      const val = args[++i];
      if (!val || val.startsWith("-")) {
        throw new Error('Option "--base" requires a git ref argument.');
      }
      baseRef = val;
      continue;
    }
    if (arg === "--scope") {
      const val = args[++i];
      if (!val || val.startsWith("-")) {
        throw new Error(
          'Option "--scope" requires a workspace target argument.',
        );
      }
      explicitTargets.push(normalizeCoverageTarget(val));
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option "${arg}".\n\n${USAGE_TEXT}`);
    }
    explicitTargets.push(normalizeCoverageTarget(arg));
  }

  const combined = new Set<CoverageTarget>(explicitTargets);
  if (useChanged) {
    const changedFiles = collectChangedFilePaths(repoRoot, baseRef, gitRunner);
    for (const target of resolveTargetsForFiles(changedFiles)) {
      combined.add(target);
    }
    if (combined.size === 0) {
      return {
        help: false,
        workspaces: [],
        emptyChangedSelection: true,
      };
    }
  }

  return {
    help: false,
    workspaces: combined.size > 0 ? Array.from(combined) : undefined,
    emptyChangedSelection: false,
  };
}

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
 * Returns the coverage output directory path for a given {@link CoverageTarget}.
 */
function resolveTargetCoverageDir(
  root: string,
  target: CoverageTarget,
): string {
  if (target === "scripts") {
    return path.join(root, "coverage/scripts");
  }
  return path.join(root, target, "coverage");
}

/**
 * Removes prior coverage artifacts for the selected targets (preserving sibling workspace LCOV files on scoped runs).
 */
function cleanCoverageArtifacts(
  root: string,
  targets: readonly CoverageTarget[],
  mergedLcovPath: string,
): void {
  for (const target of targets) {
    fs.rmSync(resolveTargetCoverageDir(root, target), {
      recursive: true,
      force: true,
    });
  }
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
 * Runs coverage for a single Bun workspace (including `fumadocs-mdx` codegen for `site`).
 */
function runBunWorkspaceTarget(
  root: string,
  pkg: (typeof BUN_WORKSPACES)[number],
  spawnCommand: SpawnFn,
): void {
  const pkgDir = path.join(root, pkg);
  if (!fs.existsSync(pkgDir)) return;

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
  const expectedLcov = path.join(pkgDir, "coverage/lcov.info");
  if (!fs.existsSync(expectedLcov) || fs.statSync(expectedLcov).size === 0) {
    throw new Error(
      `Coverage collection failed: expected ${expectedLcov} was not written or is empty.`,
    );
  }
}

/**
 * Runs coverage for `scripts/`.
 */
function runScriptsCoverageTarget(root: string, spawnCommand: SpawnFn): void {
  console.log("Running coverage for scripts/...");
  runBunCoverage(
    root,
    ["--coverage-dir=coverage/scripts", "scripts/"],
    spawnCommand,
  );
  const scriptsLcov = path.join(root, "coverage/scripts/lcov.info");
  if (!fs.existsSync(scriptsLcov) || fs.statSync(scriptsLcov).size === 0) {
    throw new Error(
      `Coverage collection failed: expected ${scriptsLcov} was not written or is empty.`,
    );
  }
}

/**
 * Runs Vitest coverage for `apps/frontend`.
 */
function runFrontendCoverageTarget(root: string, spawnCommand: SpawnFn): void {
  if (!fs.existsSync(path.join(root, "apps/frontend"))) return;

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
  const frontendLcov = path.join(root, "apps/frontend/coverage/lcov.info");
  if (!fs.existsSync(frontendLcov) || fs.statSync(frontendLcov).size === 0) {
    throw new Error(
      `Coverage collection failed: expected ${frontendLcov} was not written or is empty.`,
    );
  }
}

/**
 * Executes test suites with coverage across all selected monorepo targets (or all workspaces when unfiltered)
 * and merges the resulting LCOV reports into `coverage/lcov.info`.
 *
 * @param options - Optional repository root, output directory, cleanup flag, workspace subset, and spawner seam.
 * @returns Object containing `mergedCount` (number of LCOV files combined) and `outputPath`.
 * @throws {Error} When any selected workspace test suite, `fumadocs-mdx` codegen step, or LCOV write fails.
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

  const selectedTargets: CoverageTarget[] =
    options.workspaces && options.workspaces.length > 0
      ? Array.from(new Set(options.workspaces.map(normalizeCoverageTarget)))
      : [...COVERAGE_TARGETS];
  const selectedSet = new Set<CoverageTarget>(selectedTargets);

  if (options.cleanPriorReports) {
    cleanCoverageArtifacts(root, selectedTargets, mergedLcovPath);
  }

  fs.mkdirSync(mergedLcovDir, { recursive: true });

  for (const pkg of BUN_WORKSPACES) {
    if (selectedSet.has(pkg)) {
      runBunWorkspaceTarget(root, pkg, spawnCommand);
    }
  }

  if (selectedSet.has("scripts")) {
    runScriptsCoverageTarget(root, spawnCommand);
  }

  if (selectedSet.has("apps/frontend")) {
    runFrontendCoverageTarget(root, spawnCommand);
  }

  const lcovEntries: LcovEntry[] = [];
  discoverLcovEntries(root, root, mergedLcovPath, lcovEntries);

  const unifiedLcov = mergeLcovContents(lcovEntries, root);
  fs.writeFileSync(mergedLcovPath, unifiedLcov, "utf8");

  if (
    !fs.existsSync(mergedLcovPath) ||
    fs.statSync(mergedLcovPath).size === 0
  ) {
    throw new Error(
      `Coverage collection failed: merged report ${mergedLcovPath} was not created or is empty.`,
    );
  }
  console.log(
    `Successfully merged ${lcovEntries.length} coverage files into ${mergedLcovPath}`,
  );

  return {
    mergedCount: lcovEntries.length,
    outputPath: mergedLcovPath,
  };
}

/**
 * Formats a concise single-line trailing failure summary for stderr when coverage collection fails.
 *
 * @param err - Error instance or thrown value from coverage execution or CLI parsing.
 * @returns Single-line failure summary pointing to the test/error output above the coverage table.
 */
export function formatCoverageFailureMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `[collect-coverage] FAILED: ${message} (inspect test/error summary above the coverage table)`;
}

if (import.meta.main) {
  try {
    const cli = parseCollectCoverageCliArgs(process.argv.slice(2));
    if (cli.help) {
      console.log(USAGE_TEXT);
      process.exit(0);
    }
    if (cli.emptyChangedSelection) {
      console.log(
        "No coverage-tracked workspaces matched changed files; skipping coverage run.",
      );
      process.exit(0);
    }
    collectCoverage({
      cleanPriorReports: true,
      workspaces: cli.workspaces,
    }).catch((err) => {
      console.error(formatCoverageFailureMessage(err));
      process.exit(1);
    });
  } catch (err) {
    console.error(formatCoverageFailureMessage(err));
    process.exit(1);
  }
}
