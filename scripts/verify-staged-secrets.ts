import { extname, isAbsolute, relative, resolve } from "node:path";

interface SecretRule {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretRule[] = [
  {
    name: "AWS Access Key ID",
    regex: /(?:^|[^A-Z0-9])(AKIA[0-9A-Z]{16})(?:[^A-Z0-9]|$)/,
  },
  {
    name: "GitHub Personal Access Token",
    regex: /(?:^|[^a-zA-Z0-9_])(ghp_[0-9a-zA-Z]{36})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "GitHub OAuth / Server Token",
    regex: /(?:^|[^a-zA-Z0-9_])(gh[ousr]_[0-9a-zA-Z]{36})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "GitHub Fine-Grained PAT",
    regex:
      /(?:^|[^a-zA-Z0-9_])(github_pat_[0-9a-zA-Z_]{82})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "Slack Token",
    regex:
      /(?:^|[^a-zA-Z0-9_])(xox[baprs]-[0-9a-zA-Z]{10,48})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "OpenAI API Key",
    regex:
      /(?:^|[^a-zA-Z0-9_])(sk-(?:proj-|live-)?[a-zA-Z0-9_-]{32,})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "Stripe API Key",
    regex:
      /(?:^|[^a-zA-Z0-9_])((?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "Private Key",
    regex: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/,
  },
];

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".tar",
  ".gz",
  ".lockb",
]);

/**
 * Suspected credential match reported by {@link scanContentForSecrets}.
 */
export interface Finding {
  /** Repository-relative path of the file containing the suspected secret. */
  file: string;
  /** 1-based line number where the match occurred. */
  line: number;
  /** Human-readable name of the matched credential pattern. */
  rule: string;
  /** Raw matched credential token (masked via {@link maskSecret} before logging). */
  token: string;
}

/**
 * Checks whether a source line carries an inline `trufflehog:ignore` suppression comment.
 *
 * @param line - Source line text to inspect.
 * @returns `true` if `trufflehog:ignore` is present on the line.
 */
export function isIgnoredLine(line: string): boolean {
  return /trufflehog:ignore/i.test(line);
}

/**
 * Redacts a secret string for safe diagnostic logging, preserving at most a short prefix.
 *
 * @param secret - Raw credential string to mask.
 * @returns Redacted string with trailing characters replaced by `*`.
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return "*".repeat(secret.length);
  }
  const prefixLength = Math.min(6, Math.floor(secret.length / 3));
  return (
    secret.slice(0, prefixLength) + "*".repeat(secret.length - prefixLength)
  );
}

/**
 * Checks whether a matched token is a known synthetic placeholder (`mock_*` or all zeros).
 */
function isSyntheticPlaceholder(token: string): boolean {
  return token.startsWith("mock_") || /^0+$/.test(token);
}

/**
 * Scans text content line-by-line against high-confidence credential regex patterns.
 *
 * @param content - File text content to scan.
 * @param filePath - File path label attached to any resulting {@link Finding} records. Defaults to `"unknown"`.
 * @returns Array of detected secret findings.
 */
export function scanContentForSecrets(
  content: string,
  filePath = "unknown",
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isIgnoredLine(line)) {
      continue;
    }

    for (const pattern of SECRET_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (!match) continue;

      const token = match[1] ?? match[0];
      if (!isSyntheticPlaceholder(token)) {
        findings.push({
          file: filePath,
          line: i + 1,
          rule: pattern.name,
          token,
        });
      }
    }
  }

  return findings;
}

/**
 * Minimal subprocess result interface for injectable git command execution in tests.
 */
export interface GitRunnerResult {
  /** Subprocess exit code (`0` indicates success). */
  exitCode: number;
  /** Standard output buffer or string. */
  stdout: { toString(): string } | string;
  /** Optional standard error buffer or string. */
  stderr?: { toString(): string } | string;
}

let cachedRepoRoot: string | null = null;

/**
 * Resolves and caches the git repository top-level directory path.
 */
function getRepoRoot(): string {
  if (cachedRepoRoot) return cachedRepoRoot;
  try {
    const proc = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"]);
    if (proc.exitCode === 0) {
      cachedRepoRoot = proc.stdout.toString().trim();
      return cachedRepoRoot;
    }
  } catch {
    // Fall back to process.cwd()
  }
  return process.cwd();
}

/**
 * Normalizes an arbitrary file path into a forward-slash path relative to the git repository root.
 *
 * @param filePath - Input file path (absolute, relative to `cwd`, or already repo-relative).
 * @param repoRoot - Git repository root path. Defaults to `git rev-parse --show-toplevel`.
 * @param cwd - Current working directory. Defaults to `process.cwd()`.
 * @returns Normalized repository-relative path string.
 */
export function toRepoRelativePath(
  filePath: string,
  repoRoot: string = getRepoRoot(),
  cwd: string = process.cwd(),
): string {
  if (isAbsolute(filePath)) {
    return relative(repoRoot, filePath).replace(/\\/g, "/");
  }

  if (filePath.startsWith("./") || filePath.startsWith("../")) {
    const abs = resolve(cwd, filePath);
    return relative(repoRoot, abs).replace(/\\/g, "/");
  }

  if (cwd === repoRoot) {
    return filePath.replace(/\\/g, "/");
  }

  const relCwdFromRepo = relative(repoRoot, cwd).replace(/\\/g, "/");
  if (filePath.startsWith(relCwdFromRepo + "/")) {
    return filePath.replace(/\\/g, "/");
  }

  const abs = resolve(cwd, filePath);
  const relFromRepo = relative(repoRoot, abs).replace(/\\/g, "/");
  return relFromRepo.startsWith("../")
    ? filePath.replace(/\\/g, "/")
    : relFromRepo;
}

/**
 * Splits null-delimited (`-z`) `git diff --name-only` output into trimmed file paths.
 *
 * @param output - Raw null-delimited stdout from `git diff -z`.
 * @returns Array of non-empty file path strings.
 */
export function parseStagedFilesOutput(output: string): string[] {
  if (!output) {
    return [];
  }
  return output
    .split("\0")
    .map((filePath) => filePath.trim())
    .filter(Boolean);
}

/**
 * Queries git for paths staged for deletion (`--diff-filter=D`).
 *
 * @param spawnFn - Injectable subprocess runner.
 * @returns Set of repository-relative file paths staged for deletion.
 */
export function getStagedDeletedFiles(
  spawnFn: (args: string[]) => GitRunnerResult = (args) => Bun.spawnSync(args),
): Set<string> {
  try {
    const proc = spawnFn([
      "git",
      "diff",
      "--name-only",
      "--cached",
      "--diff-filter=D",
      "-z",
    ]);
    if (proc.exitCode === 0) {
      return new Set(parseStagedFilesOutput(proc.stdout.toString()));
    }
  } catch {
    // Ignore and return empty set
  }
  return new Set();
}

/**
 * Queries git for all non-deleted staged file paths (`--diff-filter=d`).
 *
 * @param spawnFn - Injectable subprocess runner.
 * @param onExit - Injectable exit handler invoked with `1` if `git diff` fails.
 * @returns Array of staged repository-relative file paths.
 */
export function getStagedFiles(
  spawnFn: (args: string[]) => GitRunnerResult = (args) => Bun.spawnSync(args),
  onExit: (code: number) => never = (code) => process.exit(code),
): string[] {
  let proc: GitRunnerResult;
  try {
    proc = spawnFn([
      "git",
      "diff",
      "--name-only",
      "--cached",
      "--diff-filter=d",
      "-z",
    ]);
  } catch (err) {
    console.error("❌ Exception while executing git diff:", err);
    return onExit(1);
  }

  if (proc.exitCode !== 0) {
    console.error(
      `❌ Failed to query staged files with git diff (exit code ${proc.exitCode}): ${proc.stderr?.toString() ?? ""}`,
    );
    return onExit(1);
  }
  return parseStagedFilesOutput(proc.stdout.toString());
}

/**
 * Filters out binary blobs containing null bytes (`\0`).
 */
function sanitizeFileText(text: string): string | null {
  return text.includes("\0") ? null : text;
}

/**
 * Reads the staged git index blob (`git show :<path>`) for a file path.
 *
 * @param filePath - File path to read from the git index.
 * @param repoRoot - Git repository root path.
 * @param spawnFn - Injectable subprocess runner.
 * @param onExit - Injectable exit handler invoked with `1` if reading the staged blob fails.
 * @returns UTF-8 text content of the staged blob, or `null` for binary files.
 */
export function readStagedContent(
  filePath: string,
  repoRoot: string = getRepoRoot(),
  spawnFn: (args: string[]) => GitRunnerResult = (args) => Bun.spawnSync(args),
  onExit: (code: number) => never = (code) => process.exit(code),
): string | null {
  const ext = extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return null;
  }

  const normalizedPath = toRepoRelativePath(filePath, repoRoot);

  let proc: GitRunnerResult;
  try {
    proc = spawnFn(["git", "show", `:${normalizedPath}`]);
  } catch (err) {
    console.error(
      `❌ Exception reading staged blob for ${normalizedPath}:`,
      err,
    );
    return onExit(1);
  }

  if (proc.exitCode === 0) {
    return sanitizeFileText(proc.stdout.toString());
  }

  console.error(
    `❌ Unable to read staged blob for ${normalizedPath} (exit code ${proc.exitCode}): ${proc.stderr?.toString() ?? ""}`,
  );
  return onExit(1);
}

/**
 * Executes the staged secrets verification workflow.
 */
function run(): void {
  const startTime = performance.now();
  const cliArgs = process.argv.slice(2);
  const deletedFiles = getStagedDeletedFiles();
  const rawFiles = cliArgs.length > 0 ? cliArgs : getStagedFiles();
  const filesToScan = rawFiles
    .map((filePath) => toRepoRelativePath(filePath))
    .filter((filePath) => !deletedFiles.has(filePath));

  if (filesToScan.length === 0) {
    console.log("🔍 No staged files to scan for secrets.");
    return;
  }

  const allFindings: Finding[] = [];
  let scannedCount = 0;

  for (const file of filesToScan) {
    const content = readStagedContent(file);
    if (content === null) {
      continue;
    }
    scannedCount++;
    allFindings.push(...scanContentForSecrets(content, file));
  }

  const elapsed = (performance.now() - startTime).toFixed(1);

  if (allFindings.length > 0) {
    console.error(
      `\n❌ Secret Detection Failure: Found ${allFindings.length} suspected secret(s) across staged files:\n`,
    );
    for (const f of allFindings) {
      console.error(
        `  - ${f.file}:${f.line} [${f.rule}] ${maskSecret(f.token)}`,
      );
    }
    console.error(
      "\nTo resolve:\n" +
        "1. Remove real credentials immediately and rotate compromised keys.\n" +
        "2. For synthetic unit test fixtures or mock keys, append `// trufflehog:ignore`\n" +
        "   in `//`-comment files or `# trufflehog:ignore` in `#`-comment files per .agents/AGENTS.md.\n",
    );
    process.exit(1);
  }

  console.log(
    `✅ Staged secret scan passed (${scannedCount} file(s) checked in ${elapsed}ms).`,
  );
}

if (import.meta.main) {
  run();
}
