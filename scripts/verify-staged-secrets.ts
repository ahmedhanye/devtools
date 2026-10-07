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

export interface Finding {
  file: string;
  line: number;
  rule: string;
  token: string;
}

export function isIgnoredLine(line: string): boolean {
  return /trufflehog:ignore/i.test(line);
}

export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return "*".repeat(secret.length);
  }
  const prefixLength = Math.min(6, Math.floor(secret.length / 3));
  return (
    secret.slice(0, prefixLength) + "*".repeat(secret.length - prefixLength)
  );
}

function isSyntheticPlaceholder(token: string): boolean {
  if (token.startsWith("mock_") || /^0+$/.test(token)) {
    return true;
  }
  return false;
}

export function scanContentForSecrets(
  content: string,
  filePath = "unknown",
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isIgnoredLine(line)) {
      continue;
    }

    for (const pattern of SECRET_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (match) {
        const token = match[1] ?? match[0];
        if (isSyntheticPlaceholder(token)) {
          continue;
        }

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

export interface GitRunnerResult {
  exitCode: number;
  stdout: { toString(): string } | string;
  stderr?: { toString(): string } | string;
}

let cachedRepoRoot: string | null = null;
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
  if (relFromRepo.startsWith("../")) {
    return filePath.replace(/\\/g, "/");
  }
  return relFromRepo;
}

export function parseStagedFilesOutput(output: string): string[] {
  if (!output) {
    return [];
  }
  return output
    .split("\0")
    .map((filePath) => filePath.trim())
    .filter(Boolean);
}

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
  const output = proc.stdout.toString();
  return parseStagedFilesOutput(output);
}

function sanitizeFileText(text: string): string | null {
  if (text.includes("\0")) {
    return null;
  }
  return text;
}

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
    const findings = scanContentForSecrets(content, file);
    allFindings.push(...findings);
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
        "   or `# trufflehog:ignore` to the line per .agents/rules/secrets.md.\n",
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
