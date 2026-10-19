import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface FileDiffCoverage {
  file: string;
  modifiedExecutable: number;
  covered: number;
  percent: number;
  uncoveredLines: number[];
}

export interface DiffCoverageResult {
  totalModifiedExecutableLines: number;
  coveredModifiedLines: number;
  diffCoveragePercent: number;
  passed: boolean;
  threshold: number;
  fileResults: FileDiffCoverage[];
}

/**
 * Normalizes file paths for consistent map lookups.
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Determines whether a file path represents a testable source code file.
 */
function isTestableSourceFile(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(normalized)) {
    return false;
  }
  if (
    normalized.includes(".test.") ||
    normalized.includes(".spec.") ||
    normalized.endsWith(".d.ts") ||
    normalized.includes("/tests/") ||
    normalized.includes(".stories.") ||
    /\.config\.[a-z]+$/.test(normalized) ||
    normalized.startsWith("scripts/")
  ) {
    return false;
  }
  return true;
}

/**
 * Checks whether source code contains only type definitions and emits no runtime JavaScript statements.
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
 * Checks whether a repository file consists exclusively of type definitions.
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
 * Parses LCOV content into a map of:
 * normalizedFilePath -> (lineNumber -> hitCount)
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
      const parts = line.slice(3).split(",");
      const lineNum = Number.parseInt(parts[0] ?? "", 10);
      const hits = Number.parseInt(parts[1] ?? "", 10);
      if (!Number.isNaN(lineNum) && !Number.isNaN(hits)) {
        currentLines.set(lineNum, (currentLines.get(lineNum) ?? 0) + hits);
      }
    } else if (line === "end_of_record") {
      currentFile = null;
    }
  }

  return result;
}

/**
 * Parses unified git diff text and returns a map of:
 * normalizedFilePath -> array of modified/added line numbers in HEAD
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
      const target = line.slice(4).trim();
      if (target === "/dev/null" || target === "b/dev/null") {
        currentFile = null;
      } else {
        const cleaned = target.startsWith("b/") ? target.slice(2) : target;
        currentFile = normalizePath(cleaned);
        if (!result.has(currentFile)) {
          result.set(currentFile, []);
        }
      }
    } else if (line.startsWith("@@ ")) {
      // e.g. @@ -10,3 +10,4 @@ or @@ -1 +1 @@
      inHunk = true;
      const match = line.match(
        /^@@\s+-[0-9]+(?:,[0-9]+)?\s+\+([0-9]+)(?:,([0-9]+))?\s+@@/,
      );
      if (match && match[1]) {
        currentLineInNew = Number.parseInt(match[1], 10);
      }
    } else if (currentFile && inHunk) {
      if (line.startsWith("\\")) {
        // e.g. "\ No newline at end of file"; metadata line, does not represent source lines
        continue;
      }
      if (line.startsWith("+")) {
        const list = result.get(currentFile)!;
        list.push(currentLineInNew);
        currentLineInNew++;
      } else if (line.startsWith("-")) {
        // Line removed from old version; does not advance new file line counter
      } else {
        // Context line
        currentLineInNew++;
      }
    }
  }

  return result;
}

export interface DiffCoverageOptions {
  isTypeOnly?: (filePath: string) => boolean;
}

/**
 * Computes diff coverage by matching added/modified lines in git diff against LCOV execution data.
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
    if (!isTestableSourceFile(file)) {
      continue;
    }

    const fileLcov = lcovMap.get(file);

    if (!fileLcov) {
      if (checkTypeOnly(file)) {
        continue;
      }
      if (modifiedLines.length > 0) {
        totalModifiedExecutableLines += modifiedLines.length;
        fileResults.push({
          file,
          modifiedExecutable: modifiedLines.length,
          covered: 0,
          percent: 0,
          uncoveredLines: [...modifiedLines],
        });
      }
      continue;
    }

    let fileExecutable = 0;
    let fileCovered = 0;
    const uncovered: number[] = [];

    for (const lineNum of modifiedLines) {
      if (fileLcov.has(lineNum)) {
        fileExecutable++;
        const hits = fileLcov.get(lineNum) ?? 0;
        if (hits > 0) {
          fileCovered++;
        } else {
          uncovered.push(lineNum);
        }
      }
    }

    if (fileExecutable > 0) {
      totalModifiedExecutableLines += fileExecutable;
      coveredModifiedLines += fileCovered;
      const percent = Number(((fileCovered / fileExecutable) * 100).toFixed(2));
      fileResults.push({
        file,
        modifiedExecutable: fileExecutable,
        covered: fileCovered,
        percent,
        uncoveredLines: uncovered,
      });
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

  const passed = diffCoveragePercent >= threshold;

  return {
    totalModifiedExecutableLines,
    coveredModifiedLines,
    diffCoveragePercent,
    passed,
    threshold,
    fileResults,
  };
}

/**
 * Formats a clean GitHub Markdown summary table of diff coverage.
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

export interface VerifyDiffCoverageOptions {
  baseRef?: string;
  headRef?: string;
  lcovPath?: string;
  threshold?: number;
  outputFile?: string | null;
  gitCommand?: (args: string[]) => {
    status: number | null;
    stdout?: string;
    stderr?: string;
  };
  log?: (msg: string) => void;
  error?: (msg: string) => void;
  warn?: (msg: string) => void;
  readFile?: (path: string, encoding: "utf8") => string;
  writeFile?: (path: string, content: string, encoding: "utf8") => void;
  fileExists?: (path: string) => boolean;
  mkdir?: (path: string, options: { recursive: boolean }) => void;
}

/**
 * Runs diff coverage verification against the base ref and coverage report.
 * Fails closed immediately if the diff cannot be computed against the base ref.
 */
export function verifyDiffCoverage(
  options: VerifyDiffCoverageOptions = {},
): number {
  const baseRef = options.baseRef || "origin/main";
  const headRef = options.headRef || "HEAD";
  const lcovPath = options.lcovPath || "coverage/lcov.info";
  const threshold = options.threshold ?? 100;
  const outputFile = options.outputFile ?? null;

  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  const fileExists = options.fileExists ?? fs.existsSync;
  const readFile = options.readFile ?? fs.readFileSync;
  const writeFile = options.writeFile ?? fs.writeFileSync;
  const mkdir = options.mkdir ?? fs.mkdirSync;
  const gitCommand =
    options.gitCommand ??
    ((args: string[]) =>
      spawnSync("git", args, {
        encoding: "utf8",
      }));

  if (!fileExists(lcovPath)) {
    error(
      `Error: LCOV coverage file not found at "${lcovPath}". Run "bun run test:coverage" first.`,
    );
    return 1;
  }

  const lcovContent = readFile(lcovPath, "utf8");
  const lcovMap = parseLcov(lcovContent);

  let mergeBaseRef = baseRef;
  const mbCmd = gitCommand(["merge-base", baseRef, headRef]);
  if (mbCmd.status === 0 && mbCmd.stdout && mbCmd.stdout.trim()) {
    mergeBaseRef = mbCmd.stdout.trim();
  }

  let diffArgs = [`${baseRef}...${headRef}`];
  if (headRef === "HEAD") {
    const status = gitCommand(["status", "--porcelain"]);
    if (
      status.status === 0 &&
      status.stdout &&
      status.stdout.trim().length > 0
    ) {
      diffArgs = [mergeBaseRef];
    }
  }

  const gitDiffCmd = gitCommand(["diff", "-U0", ...diffArgs]);

  let diffText = "";
  if (gitDiffCmd.status === 0) {
    diffText = gitDiffCmd.stdout || "";
    // If diff between baseRef and headRef is empty, check working tree against mergeBaseRef
    if (!diffText.trim()) {
      const workingDiff = gitCommand(["diff", "-U0", mergeBaseRef]);
      if (workingDiff.status === 0 && workingDiff.stdout) {
        diffText = workingDiff.stdout;
      }
    }
  } else {
    const cleanBase = baseRef.replace(/^origin\//, "");
    error(
      `Error: Could not diff against "${baseRef}...${headRef}". ` +
        `Ensure the base ref exists locally (e.g. run "git fetch origin ${cleanBase}").\n` +
        `Git error: ${gitDiffCmd.stderr || gitDiffCmd.stdout || "unknown error"}`,
    );
    return 1;
  }

  const diffMap = parseGitDiff(diffText);
  const result = calculateDiffCoverage(diffMap, lcovMap, threshold);
  const summary = generateMarkdownSummary(result);

  log(summary);

  if (outputFile) {
    mkdir(path.dirname(outputFile), { recursive: true });
    writeFile(outputFile, summary, "utf8");
    log(`Coverage summary written to ${outputFile}`);
  }

  if (!result.passed) {
    error(
      `Diff coverage ${result.diffCoveragePercent.toFixed(2)}% is below required ${threshold}%.`,
    );
    return 1;
  }

  return 0;
}

/**
 * CLI Runner. Returns a numeric exit code (0 for success, non-zero for failure).
 */
async function runCli(): Promise<number> {
  const args = process.argv.slice(2);
  let baseRef = process.env.BASE_REF || "origin/main";
  let headRef = "HEAD";
  let lcovPath = "coverage/lcov.info";
  let threshold = 100;
  let outputFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--base" && args[i + 1]) {
      baseRef = args[++i]!;
    } else if (arg === "--head" && args[i + 1]) {
      headRef = args[++i]!;
    } else if (arg === "--lcov" && args[i + 1]) {
      lcovPath = args[++i]!;
    } else if (arg === "--min" && args[i + 1]) {
      threshold = Number.parseFloat(args[++i]!);
    } else if (arg === "--output" && args[i + 1]) {
      outputFile = args[++i]!;
    }
  }

  return verifyDiffCoverage({
    baseRef,
    headRef,
    lcovPath,
    threshold,
    outputFile,
  });
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
