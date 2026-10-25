import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Per-file diff coverage metrics computed by {@link calculateDiffCoverage}.
 */
export interface FileDiffCoverage {
  /** Normalized repository-relative path of the modified file. */
  file: string;
  /** Number of modified or added executable source lines in the file. */
  modifiedExecutable: number;
  /** Number of modified executable lines with at least one LCOV execution hit. */
  covered: number;
  /** Percentage (`0–100`) of modified executable lines covered. */
  percent: number;
  /** 1-based line numbers of modified executable lines that received `0` hits. */
  uncoveredLines: number[];
}

/**
 * Aggregate diff coverage verification result returned by {@link calculateDiffCoverage}.
 */
export interface DiffCoverageResult {
  /** Total modified executable lines across all testable files in the git diff. */
  totalModifiedExecutableLines: number;
  /** Total modified executable lines covered by tests. */
  coveredModifiedLines: number;
  /** Aggregate diff coverage percentage (`0–100`). */
  diffCoveragePercent: number;
  /** Whether `diffCoveragePercent >= threshold`. */
  passed: boolean;
  /** Required minimum diff coverage percentage threshold. */
  threshold: number;
  /** Per-file diff coverage breakdowns. */
  fileResults: FileDiffCoverage[];
}

/**
 * Normalizes file paths for consistent map lookups.
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Determines whether a file path represents a testable runtime source code file.
 */
function isTestableSourceFile(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized)) {
    return false;
  }
  return !(
    normalized.includes(".test.") ||
    normalized.includes(".spec.") ||
    normalized.endsWith(".d.ts") ||
    normalized.includes("/tests/") ||
    normalized.includes(".stories.") ||
    /\.config\.[a-z]+$/.test(normalized) ||
    normalized.startsWith("scripts/")
  );
}

/**
 * Checks whether TypeScript/JSX source text contains only type definitions and emits no runtime JavaScript statements.
 *
 * @param sourceText - Raw TypeScript or TSX source string.
 * @param filePath - Optional file path used to select the `"ts"` or `"tsx"` transpiler loader. Defaults to `"file.ts"`.
 * @returns `true` if transpiling the source produces no executable statements.
 */
export function isTypeOnlySource(
  sourceText: string,
  filePath = "file.ts",
): boolean {
  if (!sourceText || !sourceText.trim()) {
    return true;
  }
  if (typeof Bun !== "undefined" && Bun.Transpiler) {
    try {
      const loader =
        filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? "tsx" : "ts";
      const transpiler = new Bun.Transpiler({ loader });
      const transformed = transpiler.transformSync(sourceText);
      return transformed.replace(/export\s*\{\s*\};?/g, "").trim().length === 0;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Checks whether a repository file on disk consists exclusively of TypeScript type definitions.
 *
 * @param filePath - Path to the source file to inspect.
 * @returns `true` if the file exists and emits no runtime statements when transpiled.
 */
export function isTypeOnlyFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return isTypeOnlySource(content, filePath);
  } catch {
    return false;
  }
}

/**
 * Records a single `DA:<line>,<hits>` LCOV directive into `currentLines`.
 */
function recordLcovDaLine(
  line: string,
  currentLines: Map<number, number>,
): void {
  const parts = line.slice(3).split(",");
  const lineNum = Number.parseInt(parts[0] ?? "", 10);
  const hits = Number.parseInt(parts[1] ?? "", 10);
  if (!Number.isNaN(lineNum) && !Number.isNaN(hits)) {
    currentLines.set(lineNum, (currentLines.get(lineNum) ?? 0) + hits);
  }
}

/**
 * Parses LCOV report content into a nested map of `normalizedFilePath -> (lineNumber -> hitCount)`.
 *
 * @param lcovContent - Raw LCOV text content.
 * @returns Map associating each normalized file path with its line execution counts.
 */
export function parseLcov(
  lcovContent: string,
): Map<string, Map<number, number>> {
  const result = new Map<string, Map<number, number>>();
  if (!lcovContent || !lcovContent.trim()) {
    return result;
  }

  let currentFile: string | null = null;
  let currentLines = new Map<number, number>();

  for (const rawLine of lcovContent.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("SF:")) {
      currentFile = normalizePath(line.slice(3).trim());
      currentLines = result.get(currentFile) ?? new Map<number, number>();
      result.set(currentFile, currentLines);
    } else if (line.startsWith("DA:") && currentFile) {
      recordLcovDaLine(line, currentLines);
    } else if (line === "end_of_record") {
      currentFile = null;
    }
  }

  return result;
}

/**
 * Extracts the normalized new-file target path from a `+++ b/<path>` diff header line.
 */
function parsePlusHeaderFile(line: string): string | null {
  const target = line.slice(4).trim();
  if (target === "/dev/null" || target === "b/dev/null") {
    return null;
  }
  const cleaned = target.startsWith("b/") ? target.slice(2) : target;
  return normalizePath(cleaned);
}

/**
 * Parses the starting new-file line number from a unified diff hunk header (`@@ -a,b +c,d @@`).
 */
function parseHunkStartLine(line: string): number | null {
  const match = line.match(
    /^@@\s+-[0-9]+(?:,[0-9]+)?\s+\+([0-9]+)(?:,([0-9]+))?\s+@@/,
  );
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

/**
 * Processes a single content line inside an active unified diff hunk and returns the updated new-file line number.
 */
function applyDiffHunkContentLine(
  line: string,
  fileLines: number[],
  currentLineInNew: number,
): number {
  if (line.startsWith("\\") || line.startsWith("-")) {
    return currentLineInNew;
  }
  if (line.startsWith("+")) {
    fileLines.push(currentLineInNew);
  }
  return currentLineInNew + 1;
}

/**
 * Parses unified `git diff` output and returns a map of `normalizedFilePath -> addedOrModifiedLineNumbers`.
 *
 * @param diffText - Unified git diff text (`git diff -U0`).
 * @returns Map of normalized file paths to arrays of 1-based modified line numbers in `HEAD`.
 */
export function parseGitDiff(diffText: string): Map<string, number[]> {
  const result = new Map<string, number[]>();
  if (!diffText || !diffText.trim()) {
    return result;
  }

  let currentFile: string | null = null;
  let currentLineInNew = 0;
  let inHunk = false;

  for (const rawLine of diffText.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    if (line.startsWith("diff --git ")) {
      currentFile = null;
      inHunk = false;
    } else if (line.startsWith("+++ ") && !inHunk) {
      currentFile = parsePlusHeaderFile(line);
      if (currentFile && !result.has(currentFile)) {
        result.set(currentFile, []);
      }
    } else if (line.startsWith("@@ ")) {
      inHunk = true;
      currentLineInNew = parseHunkStartLine(line) ?? currentLineInNew;
    } else if (currentFile && inHunk) {
      currentLineInNew = applyDiffHunkContentLine(
        line,
        result.get(currentFile)!,
        currentLineInNew,
      );
    }
  }

  return result;
}

/**
 * Optional seam overrides for {@link calculateDiffCoverage}.
 */
export interface DiffCoverageOptions {
  /** Custom callback determining whether a file path contains only TypeScript type declarations. */
  isTypeOnly?: (filePath: string) => boolean;
}

/**
 * Computes diff coverage for a single file against its LCOV line map.
 */
function evaluateSingleFileDiff(
  file: string,
  modifiedLines: number[],
  fileLcov: Map<number, number> | undefined,
  checkTypeOnly: (filePath: string) => boolean,
): FileDiffCoverage | null {
  if (!fileLcov) {
    if (checkTypeOnly(file) || modifiedLines.length === 0) {
      return null;
    }
    return {
      file,
      modifiedExecutable: modifiedLines.length,
      covered: 0,
      percent: 0,
      uncoveredLines: [...modifiedLines],
    };
  }

  let fileExecutable = 0;
  let fileCovered = 0;
  const uncovered: number[] = [];

  for (const lineNum of modifiedLines) {
    if (!fileLcov.has(lineNum)) continue;
    fileExecutable++;
    if ((fileLcov.get(lineNum) ?? 0) > 0) {
      fileCovered++;
    } else {
      uncovered.push(lineNum);
    }
  }

  if (fileExecutable === 0) {
    return null;
  }

  return {
    file,
    modifiedExecutable: fileExecutable,
    covered: fileCovered,
    percent: Number(((fileCovered / fileExecutable) * 100).toFixed(2)),
    uncoveredLines: uncovered,
  };
}

/**
 * Computes diff coverage by matching added/modified lines in a git diff against LCOV execution data.
 *
 * @param diffMap - Map of normalized file paths to modified 1-based line numbers.
 * @param lcovMap - Map of normalized file paths to LCOV line hit counts.
 * @param threshold - Minimum required diff coverage percentage (`0–100`). Defaults to `100`.
 * @param options - Optional type-only file detector seam.
 * @returns Aggregate and per-file {@link DiffCoverageResult}.
 */
export function calculateDiffCoverage(
  diffMap: Map<string, number[]>,
  lcovMap: Map<string, Map<number, number>>,
  threshold = 100,
  options?: DiffCoverageOptions,
): DiffCoverageResult {
  let totalModifiedExecutableLines = 0;
  let coveredModifiedLines = 0;
  const fileResults: FileDiffCoverage[] = [];
  const checkTypeOnly = options?.isTypeOnly ?? isTypeOnlyFile;

  for (const [file, modifiedLines] of diffMap.entries()) {
    if (!isTestableSourceFile(file)) continue;

    const item = evaluateSingleFileDiff(
      file,
      modifiedLines,
      lcovMap.get(file),
      checkTypeOnly,
    );
    if (item) {
      totalModifiedExecutableLines += item.modifiedExecutable;
      coveredModifiedLines += item.covered;
      fileResults.push(item);
    }
  }

  const diffCoveragePercent =
    totalModifiedExecutableLines === 0
      ? 100
      : Number(
          ((coveredModifiedLines / totalModifiedExecutableLines) * 100).toFixed(
            2,
          ),
        );

  return {
    totalModifiedExecutableLines,
    coveredModifiedLines,
    diffCoveragePercent,
    passed: diffCoveragePercent >= threshold,
    threshold,
    fileResults,
  };
}

/**
 * Formats a GitHub-flavored Markdown summary table for a {@link DiffCoverageResult}.
 *
 * @param result - Computed diff coverage result.
 * @returns Formatted Markdown report string.
 */
export function generateMarkdownSummary(result: DiffCoverageResult): string {
  const statusEmoji = result.passed ? "✅" : "❌";
  const statusText = result.passed ? "PASSED" : "FAILED";

  let md = `### ${statusEmoji} Diff Coverage Gate: ${statusText}\n\n`;
  md += `**Diff Coverage**: **${result.diffCoveragePercent.toFixed(2)}%** (Enforced threshold: **${result.threshold}%**)\n`;
  md += `- **Executable lines modified**: ${result.totalModifiedExecutableLines}\n`;
  md += `- **Covered modified lines**: ${result.coveredModifiedLines}\n\n`;

  if (result.fileResults.length === 0) {
    md += `_No executable source code lines modified in this diff._\n`;
    return md;
  }

  md += `| File | Executable Lines | Covered Lines | Coverage % | Uncovered Lines |\n`;
  md += `| :--- | :---: | :---: | :---: | :--- |\n`;

  for (const item of result.fileResults) {
    const uncoveredStr =
      item.uncoveredLines.length > 0 ? item.uncoveredLines.join(", ") : "None";
    md += `| \`${item.file}\` | ${item.modifiedExecutable} | ${item.covered} | ${item.percent.toFixed(2)}% | ${uncoveredStr} |\n`;
  }

  return md;
}

/**
 * Configuration options and injectable I/O seams for {@link verifyDiffCoverage}.
 */
export interface VerifyDiffCoverageOptions {
  /** Base git ref to diff against. Defaults to `"origin/main"`. */
  baseRef?: string;
  /** Head git ref to diff. Defaults to `"HEAD"`. */
  headRef?: string;
  /** Path to the unified LCOV file. Defaults to `"coverage/lcov.info"`. */
  lcovPath?: string;
  /** Minimum required diff coverage percentage (`0–100`). Defaults to `100`. */
  threshold?: number;
  /** Optional file path where the Markdown summary report should be written. */
  outputFile?: string | null;
  /** Injectable git command runner for unit testing. */
  gitCommand?: (args: string[]) => {
    status: number | null;
    stdout?: string;
    stderr?: string;
  };
  /** Injectable stdout logger. */
  log?: (msg: string) => void;
  /** Injectable stderr logger. */
  error?: (msg: string) => void;
  /** Injectable warning logger. */
  warn?: (msg: string) => void;
  /** Injectable file reader. */
  readFile?: (path: string, encoding: "utf8") => string;
  /** Injectable file writer. */
  writeFile?: (path: string, content: string, encoding: "utf8") => void;
  /** Injectable file existence check. */
  fileExists?: (path: string) => boolean;
  /** Injectable directory creator. */
  mkdir?: (path: string, options: { recursive: boolean }) => void;
}

type GitCmdFn = NonNullable<VerifyDiffCoverageOptions["gitCommand"]>;

/**
 * Resolves the merge-base commit SHA or falls back to `baseRef`.
 */
function resolveMergeBase(
  baseRef: string,
  headRef: string,
  gitCommand: GitCmdFn,
): string {
  const mbCmd = gitCommand(["merge-base", baseRef, headRef]);
  const trimmed = mbCmd.stdout?.trim();
  return mbCmd.status === 0 && trimmed ? trimmed : baseRef;
}

/**
 * Determines the `git diff` target arguments based on working-tree cleanliness.
 */
function selectDiffTargetArgs(
  baseRef: string,
  headRef: string,
  mergeBaseRef: string,
  gitCommand: GitCmdFn,
): string[] {
  if (headRef !== "HEAD") {
    return [`${baseRef}...${headRef}`];
  }
  const status = gitCommand(["status", "--porcelain"]);
  return status.status === 0 && status.stdout?.trim()
    ? [mergeBaseRef]
    : [`${baseRef}...${headRef}`];
}

/**
 * Resolves the unified git diff text between `baseRef` and `headRef`.
 */
function resolveGitDiffOutput(
  baseRef: string,
  headRef: string,
  gitCommand: GitCmdFn,
): { ok: true; diffText: string } | { ok: false; errorDetail: string } {
  const mergeBaseRef = resolveMergeBase(baseRef, headRef, gitCommand);
  const diffArgs = selectDiffTargetArgs(
    baseRef,
    headRef,
    mergeBaseRef,
    gitCommand,
  );
  const gitDiffCmd = gitCommand(["diff", "-U0", ...diffArgs]);

  if (gitDiffCmd.status !== 0) {
    return {
      ok: false,
      errorDetail: gitDiffCmd.stderr || gitDiffCmd.stdout || "unknown error",
    };
  }

  const primaryDiff = gitDiffCmd.stdout || "";
  if (primaryDiff.trim()) {
    return { ok: true, diffText: primaryDiff };
  }

  const workingDiff = gitCommand(["diff", "-U0", mergeBaseRef]);
  return {
    ok: true,
    diffText:
      workingDiff.status === 0 && workingDiff.stdout ? workingDiff.stdout : "",
  };
}

/**
 * Normalizes defaulted ref and threshold options for {@link verifyDiffCoverage}.
 */
function resolveVerifyConfig(options: VerifyDiffCoverageOptions) {
  return {
    baseRef: options.baseRef || "origin/main",
    headRef: options.headRef || "HEAD",
    lcovPath: options.lcovPath || "coverage/lcov.info",
    threshold: options.threshold ?? 100,
    outputFile: options.outputFile ?? null,
  };
}

/**
 * Normalizes defaulted I/O callbacks for {@link verifyDiffCoverage}.
 */
function resolveVerifyIo(options: VerifyDiffCoverageOptions) {
  return {
    log: options.log ?? console.log,
    error: options.error ?? console.error,
    fileExists: options.fileExists ?? fs.existsSync,
    readFile: options.readFile ?? fs.readFileSync,
    writeFile: options.writeFile ?? fs.writeFileSync,
    mkdir: options.mkdir ?? fs.mkdirSync,
    gitCommand:
      options.gitCommand ??
      ((args: string[]) => spawnSync("git", args, { encoding: "utf8" })),
  };
}

/**
 * Runs diff coverage verification against the base git ref and unified LCOV report.
 *
 * @remarks
 * Fails closed (`1`) immediately if the LCOV report is missing or if `git diff` cannot be computed.
 *
 * @param options - Diff coverage verification configuration and I/O seams.
 * @returns Numeric exit code (`0` when coverage meets threshold, `1` on failure).
 */
export function verifyDiffCoverage(
  options: VerifyDiffCoverageOptions = {},
): number {
  const cfg = resolveVerifyConfig(options);
  const io = resolveVerifyIo(options);

  if (!io.fileExists(cfg.lcovPath)) {
    io.error(
      `Error: LCOV coverage file not found at "${cfg.lcovPath}". Run "bun run test:coverage" first.`,
    );
    return 1;
  }

  const lcovMap = parseLcov(io.readFile(cfg.lcovPath, "utf8"));
  const diffOutcome = resolveGitDiffOutput(
    cfg.baseRef,
    cfg.headRef,
    io.gitCommand,
  );

  if (!diffOutcome.ok) {
    const cleanBase = cfg.baseRef.replace(/^origin\//, "");
    io.error(
      `Error: Could not diff against "${cfg.baseRef}...${cfg.headRef}". ` +
        `Ensure the base ref exists locally (e.g. run "git fetch origin ${cleanBase}").\n` +
        `Git error: ${diffOutcome.errorDetail}`,
    );
    return 1;
  }

  const diffMap = parseGitDiff(diffOutcome.diffText);
  const result = calculateDiffCoverage(diffMap, lcovMap, cfg.threshold);
  const summary = generateMarkdownSummary(result);

  io.log(summary);

  if (cfg.outputFile) {
    io.mkdir(path.dirname(cfg.outputFile), { recursive: true });
    io.writeFile(cfg.outputFile, summary, "utf8");
    io.log(`Coverage summary written to ${cfg.outputFile}`);
  }

  if (!result.passed) {
    io.error(
      `Diff coverage ${result.diffCoveragePercent.toFixed(2)}% is below required ${cfg.threshold}%.`,
    );
    return 1;
  }

  return 0;
}

/**
 * Parses CLI flag arguments for `verify-diff-coverage.ts`.
 */
function parseCliOptions(args: string[]): VerifyDiffCoverageOptions {
  const opts: VerifyDiffCoverageOptions = {
    baseRef: process.env.BASE_REF || "origin/main",
    headRef: "HEAD",
    lcovPath: "coverage/lcov.info",
    threshold: 100,
    outputFile: null,
  };

  const flagHandlers: Record<string, (val: string) => void> = {
    "--base": (val) => {
      opts.baseRef = val;
    },
    "--head": (val) => {
      opts.headRef = val;
    },
    "--lcov": (val) => {
      opts.lcovPath = val;
    },
    "--min": (val) => {
      opts.threshold = Number.parseFloat(val);
    },
    "--output": (val) => {
      opts.outputFile = val;
    },
  };

  for (let i = 0; i < args.length; i++) {
    const handler = flagHandlers[args[i] ?? ""];
    const nextVal = args[i + 1];
    if (handler && nextVal) {
      handler(nextVal);
      i++;
    }
  }

  return opts;
}

/**
 * CLI Runner. Returns a numeric exit code (`0` for success, non-zero for failure).
 */
async function runCli(): Promise<number> {
  return verifyDiffCoverage(parseCliOptions(process.argv.slice(2)));
}

if (import.meta.main) {
  runCli()
    .then((exitCode) => {
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
      return undefined;
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
