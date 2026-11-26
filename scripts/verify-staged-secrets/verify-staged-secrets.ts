import { readFileSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";

interface SecretRule {
  name: string;
  regex: RegExp;
  validate?: (token: string) => boolean;
}

/**
 * Computes the Shannon entropy (in bits per character) of an input string.
 *
 * @param value - Input string to measure.
 * @returns Shannon entropy in bits per character (`0` for empty strings).
 */
export function computeShannonEntropy(value: string): number {
  if (value.length === 0) {
    return 0;
  }
  const counts = new Map<string, number>();
  for (const ch of value) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function hasHighEntropyDiversity(token: string): boolean {
  let classes = 0;
  if (/[a-z]/.test(token)) classes += 1;
  if (/[A-Z]/.test(token)) classes += 1;
  if (/[0-9]/.test(token)) classes += 1;
  if (/[+/=_-]/.test(token)) classes += 1;
  return classes >= 3 && computeShannonEntropy(token) >= 4.2;
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
    name: "Anthropic API Key",
    regex:
      /(?:^|[^a-zA-Z0-9_])(sk-ant-api03-[a-zA-Z0-9_-]{32,})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "OpenAI API Key",
    regex:
      /(?:^|[^a-zA-Z0-9_])(sk-(?!ant-)(?:proj-|live-)?[a-zA-Z0-9_-]{32,})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "Stripe API Key",
    regex:
      /(?:^|[^a-zA-Z0-9_])((?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "Google Cloud / Firebase API Key",
    regex: /(?:^|[^a-zA-Z0-9_])(AIza[0-9A-Za-z_-]{35})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "npm Access Token",
    regex: /(?:^|[^a-zA-Z0-9_])(npm_[a-zA-Z0-9]{36})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "SendGrid API Key",
    regex:
      /(?:^|[^a-zA-Z0-9_])(SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "PyPI API Token",
    regex:
      /(?:^|[^a-zA-Z0-9_])(pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,})(?:[^a-zA-Z0-9_]|$)/,
  },
  {
    name: "Database Connection URI",
    regex:
      /((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss):\/\/[^:\s/]+:[^@\s/]{4,}@[^\s"']+)/,
  },
  {
    name: "JSON Web Token",
    regex:
      /(?:^|[^a-zA-Z0-9_-])(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,})(?:[^a-zA-Z0-9_-]|$)/,
  },
  {
    name: "Private Key",
    regex: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/,
  },
  {
    name: "High-Entropy Secret Assignment",
    regex:
      /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*["']([A-Za-z0-9+/=_-]{32,})["']/i,
    validate: hasHighEntropyDiversity,
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
    const line = lines[i] ?? "";
    if (isIgnoredLine(line)) {
      continue;
    }

    const matchedTokens = new Set<string>();
    for (const pattern of SECRET_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (!match) continue;

      const token = match[1] ?? match[0];
      if (isSyntheticPlaceholder(token)) continue;
      if (
        pattern.validate &&
        (matchedTokens.has(token) || !pattern.validate(token))
      ) {
        continue;
      }

      matchedTokens.add(token);
      findings.push({
        file: filePath,
        line: i + 1,
        rule: pattern.name,
        token,
      });
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
 * Resolved unpushed commit range for pre-push secret scanning.
 */
export interface PushRange {
  /** Base commit/ref used as `--since-commit` for TruffleHog. */
  base: string;
  /** Target commit/ref being pushed (defaults to `HEAD`). */
  head: string;
  /** Git revision range (`<base>..<head>`). */
  range: string;
}

/**
 * Parsed ref update line passed by Git to the `pre-push` hook on stdin.
 */
export interface PrePushRefUpdate {
  /** Local ref name being pushed. */
  localRef: string;
  /** Local commit OID (all-zeros for branch deletion). */
  localOid: string;
  /** Remote ref name being updated. */
  remoteRef: string;
  /** Remote commit OID (all-zeros for a newly created remote branch). */
  remoteOid: string;
}

/**
 * Result of executing {@link runRangeScan}.
 */
export interface RangeScanResult {
  /** Scanner engine used (`"trufflehog"` or `"builtin"`). */
  engine: "trufflehog" | "builtin" | "skipped";
  /** Whether the scan passed with zero detected secrets. */
  passed: boolean;
  /** Any findings reported by the built-in scanner. */
  findings: Finding[];
  /** Optional diagnostic error when range resolution or scanning fails closed. */
  error?: string;
}

/**
 * Reads Git's `pre-push` ref updates from stdin when stdin is piped (non-TTY).
 *
 * @param isTTY - Whether stdin is an interactive TTY.
 * @param readFn - Injectable stdin reader.
 * @returns Raw stdin text, or `""` when stdin is a TTY.
 */
export function readPrePushStdin(
  isTTY: boolean = process.stdin.isTTY,
  readFn: () => string = () => readFileSync(0, "utf8"),
): string {
  return isTTY ? "" : readFn();
}

/**
 * Parses `<local_ref> <local_oid> <remote_ref> <remote_oid>` lines from Git's `pre-push` stdin.
 *
 * @param stdinText - Raw stdin text provided to the `pre-push` hook.
 * @returns Parsed {@link PrePushRefUpdate} entries.
 */
export function parsePrePushRefs(stdinText: string): PrePushRefUpdate[] {
  const updates: PrePushRefUpdate[] = [];
  for (const rawLine of stdinText.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const [localRef, localOid, remoteRef, remoteOid] = trimmed.split(/\s+/);
    if (!localRef || !localOid || !remoteRef || !remoteOid) continue;
    updates.push({
      localRef,
      localOid,
      remoteRef,
      remoteOid,
    });
  }
  return updates;
}

/**
 * Resolves the git commit range to scan before pushing (`<explicitBase>..<headRef>`, `@{u}..<headRef>`, or `origin/main..<headRef>`).
 *
 * @param explicitBase - Optional explicit base ref override.
 * @param spawnFn - Injectable subprocess runner.
 * @param headRef - Target ref/OID being pushed (defaults to `HEAD`).
 * @returns Resolved {@link PushRange}, or `null` when zero unpushed commits exist.
 */
export function resolvePushRange(
  explicitBase?: string,
  spawnFn: (args: string[]) => GitRunnerResult = (args) => Bun.spawnSync(args),
  headRef = "HEAD",
): PushRange | null {
  let base = explicitBase;
  if (!base) {
    const upstream = spawnFn([
      "git",
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);
    base =
      upstream.exitCode === 0 && upstream.stdout.toString().trim()
        ? upstream.stdout.toString().trim()
        : "origin/main";
  }

  const range = `${base}..${headRef}`;
  const countRes = spawnFn(["git", "rev-list", "--count", range]);
  if (countRes.exitCode !== 0) {
    throw new Error(
      `Failed to inspect git commit range "${range}" (exit code ${countRes.exitCode}): ${countRes.stderr?.toString().trim() ?? ""}`,
    );
  }
  const count = Number.parseInt(countRes.stdout.toString().trim(), 10);
  if (Number.isFinite(count) && count <= 0) {
    return null;
  }
  return { base, head: headRef, range };
}

/**
 * Resolves all commit ranges to scan from Git's `pre-push` stdin ref list, falling back to `HEAD` when stdin is empty.
 *
 * @param explicitBase - Optional explicit base ref override.
 * @param spawnFn - Injectable subprocess runner.
 * @param prePushStdin - Raw stdin passed by Git during `pre-push`.
 * @returns Non-empty {@link PushRange} entries to scan.
 */
export function resolvePushRanges(
  explicitBase?: string,
  spawnFn: (args: string[]) => GitRunnerResult = (args) => Bun.spawnSync(args),
  prePushStdin = "",
): PushRange[] {
  if (prePushStdin.trim().length > 0) {
    const ranges: PushRange[] = [];
    for (const update of parsePrePushRefs(prePushStdin)) {
      if (/^0+$/.test(update.localOid)) {
        continue;
      }
      const base = /^0+$/.test(update.remoteOid)
        ? (explicitBase ?? "origin/main")
        : update.remoteOid;
      const resolved = resolvePushRange(base, spawnFn, update.localOid);
      if (resolved) {
        ranges.push(resolved);
      }
    }
    return ranges;
  }

  const single = resolvePushRange(explicitBase, spawnFn);
  return single ? [single] : [];
}

/**
 * Runs TruffleHog against unpushed commits using the repository's exclude file.
 *
 * @param baseRef - Base commit/ref passed to `--since-commit`.
 * @param spawnFn - Injectable subprocess runner.
 * @param headRef - Target commit/branch passed to `--branch`.
 * @returns TruffleHog process exit code (`0` means clean).
 */
export function scanCommitRangeWithTrufflehog(
  baseRef: string,
  spawnFn: (args: string[]) => GitRunnerResult = (args) => Bun.spawnSync(args),
  headRef = "HEAD",
): number {
  const res = spawnFn([
    "trufflehog",
    "git",
    "file://.",
    "--since-commit",
    baseRef,
    "--branch",
    headRef,
    "--fail",
    "--no-update",
    "--results=verified,unknown",
    "--exclude-paths=.github/trufflehog-exclude.txt",
  ]);
  return res.exitCode;
}

/**
 * Scans added lines in commit patches (including merge diffs) and commit messages across a git range using built-in patterns.
 *
 * @param range - Git revision range (e.g. `origin/main..HEAD`).
 * @param spawnFn - Injectable subprocess runner.
 * @returns Deduplicated array of suspected credential findings.
 */
export function scanCommitRangeFallback(
  range: string,
  spawnFn: (args: string[]) => GitRunnerResult = (args) => Bun.spawnSync(args),
): Finding[] {
  const findings: Finding[] = [];
  const patchProc = spawnFn(["git", "log", "-m", "-p", "--no-color", range]);
  if (patchProc.exitCode !== 0) {
    throw new Error(
      `Failed to read git patch history for "${range}" (exit code ${patchProc.exitCode}): ${patchProc.stderr?.toString().trim() ?? ""}`,
    );
  }

  let currentFile = "unknown";
  let skipBinary = false;
  let lineIndex = 0;

  for (const line of patchProc.stdout.toString().split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6).trim();
      skipBinary = BINARY_EXTENSIONS.has(extname(currentFile).toLowerCase());
      lineIndex = 0;
      continue;
    }
    if (line.startsWith("+++ /dev/null")) {
      skipBinary = true;
      continue;
    }
    if (skipBinary) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      lineIndex++;
      const added = line.slice(1);
      const lineFindings = scanContentForSecrets(added, currentFile);
      for (const f of lineFindings) {
        findings.push({ ...f, line: lineIndex });
      }
    }
  }

  const msgProc = spawnFn(["git", "log", "--format=%H%n%B", range]);
  if (msgProc.exitCode !== 0) {
    throw new Error(
      `Failed to read git commit messages for "${range}" (exit code ${msgProc.exitCode}): ${msgProc.stderr?.toString().trim() ?? ""}`,
    );
  }
  findings.push(
    ...scanContentForSecrets(msgProc.stdout.toString(), "commit-message"),
  );

  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.file}\0${f.rule}\0${f.token}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Runs pre-push secret scanning across unpushed commits using TruffleHog when installed or the built-in scanner otherwise.
 *
 * @param explicitBase - Optional explicit base ref override.
 * @param spawnFn - Injectable subprocess runner.
 * @param prePushStdin - Optional `pre-push` stdin ref list.
 * @returns {@link RangeScanResult} describing which engine ran and whether any secrets were detected.
 */
export function runRangeScan(
  explicitBase?: string,
  spawnFn: (args: string[]) => GitRunnerResult = (args) => Bun.spawnSync(args),
  prePushStdin = "",
): RangeScanResult {
  try {
    const ranges = resolvePushRanges(explicitBase, spawnFn, prePushStdin);
    if (ranges.length === 0) {
      return { engine: "skipped", passed: true, findings: [] };
    }

    const hasTrufflehog = spawnFn(["which", "trufflehog"]).exitCode === 0;
    if (hasTrufflehog) {
      for (const r of ranges) {
        const code = scanCommitRangeWithTrufflehog(r.base, spawnFn, r.head);
        if (code !== 0) {
          return { engine: "trufflehog", passed: false, findings: [] };
        }
      }
      return { engine: "trufflehog", passed: true, findings: [] };
    }

    const findings = ranges.flatMap((r) =>
      scanCommitRangeFallback(r.range, spawnFn),
    );
    return {
      engine: "builtin",
      passed: findings.length === 0,
      findings,
    };
  } catch (error) {
    return {
      engine: "builtin",
      passed: false,
      findings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printFindingsAndExit(
  findings: Finding[],
  contextLabel: string,
  exitFn: (code: number) => never = (code) => process.exit(code),
): never {
  console.error(
    `\n❌ Secret Detection Failure: Found ${findings.length} suspected secret(s) across ${contextLabel}:\n`,
  );
  for (const f of findings) {
    console.error(`  - ${f.file}:${f.line} [${f.rule}] ${maskSecret(f.token)}`);
  }
  console.error(
    "\nTo resolve:\n" +
      "1. Remove real credentials immediately and rotate compromised keys.\n" +
      "2. For synthetic unit test fixtures or mock keys, append `// trufflehog:ignore`\n" +
      "   in `//`-comment files or `# trufflehog:ignore` in `#`-comment files per .agents/AGENTS.md.\n",
  );
  return exitFn(1);
}

/** Injectable dependencies for {@link run}. */
export interface RunStagedSecretsDeps {
  runRangeScan?: typeof runRangeScan;
  readPrePushStdin?: () => string;
  getStagedDeletedFiles?: typeof getStagedDeletedFiles;
  getStagedFiles?: typeof getStagedFiles;
  readStagedContent?: typeof readStagedContent;
  exitFn?: (code: number) => never;
}

/**
 * Executes the staged or commit-range secrets verification workflow.
 */
export function run(
  cliArgs: readonly string[] = process.argv.slice(2),
  deps: RunStagedSecretsDeps = {},
): void {
  const startTime = performance.now();
  const exitFn = deps.exitFn ?? ((code) => process.exit(code));
  const rangeScan = deps.runRangeScan ?? runRangeScan;
  const readStdinFn = deps.readPrePushStdin ?? readPrePushStdin;
  const deletedFilesFn = deps.getStagedDeletedFiles ?? getStagedDeletedFiles;
  const stagedFilesFn = deps.getStagedFiles ?? getStagedFiles;
  const readStagedFn = deps.readStagedContent ?? readStagedContent;

  if (cliArgs[0] === "--range") {
    const explicitBase = cliArgs[1];
    const prePushStdin = readStdinFn();
    const result = rangeScan(explicitBase, undefined, prePushStdin);
    const elapsed = (performance.now() - startTime).toFixed(1);
    if (result.engine === "skipped") {
      console.log("🔍 No unpushed commits to scan for secrets.");
      return;
    }
    if (!result.passed) {
      if (result.findings.length > 0) {
        printFindingsAndExit(result.findings, "unpushed commits", exitFn);
      }
      if (result.error) {
        console.error(`❌ Pre-push secret scan failed: ${result.error}`);
      } else {
        console.error(
          "❌ TruffleHog detected potential secrets in unpushed commits.",
        );
      }
      exitFn(1);
    }
    console.log(
      `✅ Pre-push secret scan passed (${result.engine} engine, ${elapsed}ms).`,
    );
    return;
  }

  const deletedFiles = deletedFilesFn();
  const rawFiles = cliArgs.length > 0 ? cliArgs : stagedFilesFn();
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
    const content = readStagedFn(file);
    if (content === null) {
      continue;
    }
    scannedCount++;
    allFindings.push(...scanContentForSecrets(content, file));
  }

  const elapsed = (performance.now() - startTime).toFixed(1);

  if (allFindings.length > 0) {
    printFindingsAndExit(allFindings, "staged files", exitFn);
  }

  console.log(
    `✅ Staged secret scan passed (${scannedCount} file(s) checked in ${elapsed}ms).`,
  );
}

if (import.meta.main) {
  run();
}
