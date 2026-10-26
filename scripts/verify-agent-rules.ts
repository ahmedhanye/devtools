import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { YAML } from "bun";

/**
 * Structured lint finding produced when validating `.agents/` rules, skills, or instructions.
 */
export interface Finding {
  /** Repository-relative path to the file containing the violation. */
  file: string;
  /** 1-based line number where the violation occurred, if applicable. */
  line?: number;
  /** Machine-readable rule identifier (for example, `"rule/trigger-required"`). */
  rule: string;
  /** Actionable human-readable explanation of the violation. */
  message: string;
  /** Severity level (`"error"` blocks verification; `"warning"` is advisory). */
  severity: "error" | "warning";
}

/**
 * Result of parsing optional `---` YAML frontmatter from a Markdown document.
 */
export interface ParsedFrontmatter {
  /** Whether the document begins with a `---` frontmatter block. */
  exists: boolean;
  /** Parsed YAML key-value map, or `null` when absent or malformed. */
  data: Record<string, unknown> | null;
  /** Markdown body content following the closing `---` delimiter. */
  body: string;
  /** Diagnostic syntax error message when YAML parsing fails. */
  error?: string;
  /** Approximate 1-based line number of the YAML syntax error. */
  errorLine?: number;
}

/**
 * Schema of the root `skills-lock.json` file tracking vendor-managed skills.
 */
export interface SkillsLock {
  /** Lockfile schema version. */
  version?: number;
  /** Map of skill directory names to upstream source metadata. */
  skills?: Record<
    string,
    {
      source?: string;
      sourceType?: string;
      skillPath?: string;
      computedHash?: string;
    }
  >;
}

const MACHINE_PATH_REGEX =
  /(?:file:\/\/\/(?!path\/to\/)[a-zA-Z0-9_\-./]+|(?<=^|[\s"'`([<{])(?:\/home\/|\/Users\/)[a-zA-Z0-9_\-./]+)/g;
const MARKDOWN_LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;

const SKIPPED_LINK_PREFIXES = [
  "http://",
  "https://",
  "mailto:",
  "file://",
  "#",
  "data:",
  "/docs/",
  "/path/to/",
  "path/to/",
] as const;

/**
 * Normalizes a filesystem path to be repository-relative using forward slashes.
 *
 * @param filePath - Absolute or relative path to normalize.
 * @param repoRoot - Repository root directory. Defaults to `process.cwd()`.
 * @returns Repository-relative path string with `/` separators.
 */
export function toRepoRelative(
  filePath: string,
  repoRoot: string = process.cwd(),
): string {
  const abs = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
  return relative(repoRoot, abs).replace(/\\/g, "/");
}

/**
 * Parses YAML frontmatter delimited by `---` at the start of a Markdown document.
 *
 * @param content - Raw Markdown file content.
 * @returns {@link ParsedFrontmatter} containing parsed metadata, body text, or syntax error details.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { exists: false, data: null, body: content };
  }

  const lines = content.split("\n");
  const closingIndex = lines.findIndex(
    (line, idx) => idx > 0 && line.trim() === "---",
  );

  if (closingIndex === -1) {
    return {
      exists: true,
      data: null,
      body: content,
      error: "Unclosed YAML frontmatter: missing closing '---' delimiter",
      errorLine: 1,
    };
  }

  const frontmatterYaml = lines.slice(1, closingIndex).join("\n");
  const body = lines.slice(closingIndex + 1).join("\n");

  try {
    const data = (YAML.parse(frontmatterYaml) as Record<string, unknown>) ?? {};
    return { exists: true, data, body };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const lineMatch = errorMsg.match(/line (\d+)/i);
    const parsedLine = lineMatch ? Number(lineMatch[1]) + 1 : 2;
    return {
      exists: true,
      data: null,
      body,
      error: `YAML syntax error in frontmatter: ${errorMsg}`,
      errorLine: parsedLine,
    };
  }
}

/**
 * Verifies that Markdown code fences (`` ``` `` or ```` ```` ````) are balanced.
 *
 * @param content - Raw Markdown file content.
 * @param filePath - File path used in reported {@link Finding} items.
 * @returns Array of unclosed code-fence findings (empty when balanced).
 */
export function checkCodeFences(content: string, filePath: string): Finding[] {
  const lines = content.split("\n");
  let insideFence = false;
  let fenceMarker = "";
  let openLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(/^(\s*)(`{3,})/);
    if (!match?.[2]) continue;

    const marker = match[2];
    if (!insideFence) {
      insideFence = true;
      fenceMarker = marker;
      openLine = i + 1;
    } else if (marker.length >= fenceMarker.length) {
      insideFence = false;
      fenceMarker = "";
    }
  }

  if (!insideFence) {
    return [];
  }

  return [
    {
      file: filePath,
      line: openLine,
      rule: "code-fence/unclosed",
      message: `Unclosed code fence (${fenceMarker}) opened at line ${openLine}`,
      severity: "error",
    },
  ];
}

/**
 * Checks for leaked local absolute machine paths (`/home/`, `/Users/`, `file:///`) in tracked files.
 *
 * @remarks
 * Allows `.scratch` references and generic `/path/to/` placeholders.
 *
 * @param content - Raw Markdown file content.
 * @param filePath - File path used in reported {@link Finding} items.
 * @returns Array of machine-path leak findings.
 */
export function checkMachinePaths(
  content: string,
  filePath: string,
): Finding[] {
  return content.split("\n").flatMap((line, idx) => {
    const matches = line.match(MACHINE_PATH_REGEX);
    if (!matches) return [];
    return matches
      .filter((m) => !m.includes(".scratch") && !m.includes("/path/to/"))
      .map((match): Finding => ({
        file: filePath,
        line: idx + 1,
        rule: "path-portability/no-absolute-machine-path",
        message: `Found leaked absolute machine path "${match}". Use repository-relative paths instead.`,
        severity: "error",
      }));
  });
}

/**
 * Checks whether a Markdown link target should be ignored during local filesystem link verification.
 */
function shouldSkipLinkTarget(rawTarget: string): boolean {
  if (rawTarget === "url" || rawTarget === "path") {
    return true;
  }
  return SKIPPED_LINK_PREFIXES.some((prefix) => rawTarget.startsWith(prefix));
}

/**
 * Checks whether a regex match inside `line` is enclosed in inline backticks (`` `[text](url)` ``).
 */
function isInlineCodeWrapped(line: string, match: RegExpExecArray): boolean {
  const matchIndex = match.index ?? 0;
  const fullMatch = match[0];
  const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : "";
  const afterChar = line[matchIndex + fullMatch.length] ?? "";
  return beforeChar === "`" && afterChar === "`";
}

/**
 * Extracts a local filesystem link target from a regex match, or returns `null` when exempt.
 */
function extractLocalLinkTarget(
  line: string,
  match: RegExpExecArray,
): { rawTarget: string; cleanTarget: string } | null {
  if (isInlineCodeWrapped(line, match)) {
    return null;
  }
  const rawTarget = match[2]
    ?.trim()
    .split(/\s+["']/)[0]
    ?.trim();
  if (!rawTarget || shouldSkipLinkTarget(rawTarget)) {
    return null;
  }
  const cleanTarget = rawTarget.split("#")[0]?.split("?")[0];
  return cleanTarget ? { rawTarget, cleanTarget } : null;
}

/**
 * Validates all Markdown links on a single non-fenced line.
 */
function checkLineMarkdownLinks(
  line: string,
  lineNumber: number,
  filePath: string,
  fileDir: string,
  repoRoot: string,
): Finding[] {
  if (line.includes("for example,") || line.includes("For example,")) {
    return [];
  }

  const findings: Finding[] = [];
  for (const match of line.matchAll(MARKDOWN_LINK_REGEX)) {
    const extracted = extractLocalLinkTarget(line, match);
    if (!extracted) continue;

    const resolvedPath = extracted.cleanTarget.startsWith("/")
      ? join(repoRoot, extracted.cleanTarget)
      : resolve(fileDir, extracted.cleanTarget);

    if (!existsSync(resolvedPath)) {
      findings.push({
        file: filePath,
        line: lineNumber,
        rule: "markdown/broken-link",
        message: `Relative markdown link "${extracted.rawTarget}" points to non-existent path "${toRepoRelative(resolvedPath, repoRoot)}"`,
        severity: "error",
      });
    }
  }
  return findings;
}

/**
 * Validates that local relative Markdown links point to existing files on disk.
 *
 * @param content - Markdown body content to scan.
 * @param filePath - Repository-relative path of the Markdown file being checked.
 * @param repoRoot - Repository root directory. Defaults to `process.cwd()`.
 * @returns Array of broken-link findings.
 */
export function checkMarkdownLinks(
  content: string,
  filePath: string,
  repoRoot: string = process.cwd(),
): Finding[] {
  const findings: Finding[] = [];
  const fileDir = dirname(resolve(repoRoot, filePath));
  const lines = content.split("\n");
  let fenceMarker = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceMatch?.[2]) {
      const marker = fenceMatch[2];
      if (!fenceMarker) {
        fenceMarker = marker;
      } else if (
        marker.length >= fenceMarker.length &&
        marker[0] === fenceMarker[0]
      ) {
        fenceMarker = "";
      }
      continue;
    }
    if (!fenceMarker) {
      findings.push(
        ...checkLineMarkdownLinks(line, i + 1, filePath, fileDir, repoRoot),
      );
    }
  }

  return findings;
}

/**
 * Checks for prohibited unslop punctuation patterns (such as em dashes `—`).
 *
 * @param content - Raw Markdown file content.
 * @param filePath - File path used in reported {@link Finding} items.
 * @returns Array of unslop findings.
 */
export function checkUnslop(content: string, filePath: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes("—")) {
      findings.push({
        file: filePath,
        line: i + 1,
        rule: "unslop/no-em-dash",
        message:
          "Found prohibited em dash ('—'). Use spaced hyphens (' - ') or parentheses per .agents/skills/unslop.",
        severity: "error",
      });
    }
  }

  return findings;
}

/**
 * Validates that a frontmatter block exists and parsed without YAML syntax errors.
 */
function validateFrontmatterPresence(
  fm: ParsedFrontmatter,
  filePath: string,
  prefix: "rule" | "skill",
  label: string,
): Finding | null {
  if (!fm.exists) {
    return {
      file: filePath,
      line: 1,
      rule: `${prefix}/frontmatter-missing`,
      message: `${label} must include YAML frontmatter delimited by '---'.`,
      severity: "error",
    };
  }
  if (fm.error) {
    return {
      file: filePath,
      line: fm.errorLine ?? 1,
      rule: `${prefix}/frontmatter-syntax`,
      message: fm.error,
      severity: "error",
    };
  }
  return null;
}

/**
 * Validates that frontmatter `description` is a string of at least 10 characters.
 */
function validateDescriptionField(
  data: Record<string, unknown>,
  filePath: string,
  prefix: "rule" | "skill",
  label: string,
): Finding | null {
  if (
    typeof data.description === "string" &&
    data.description.trim().length >= 10
  ) {
    return null;
  }
  return {
    file: filePath,
    line: 3,
    rule: `${prefix}/description-required`,
    message: `${label} frontmatter must define a 'description' string with at least 10 characters.`,
    severity: "error",
  };
}

/**
 * Validates the `trigger` field in a `.agents/rules/*.md` frontmatter map.
 */
function validateRuleTriggerField(
  data: Record<string, unknown>,
  filePath: string,
): Finding | null {
  if (!data.trigger) {
    return {
      file: filePath,
      line: 2,
      rule: "rule/trigger-required",
      message:
        "Rule frontmatter must define a 'trigger' string pattern (e.g. 'apps/frontend/**' or '{package.json,bun.lock}').",
      severity: "error",
    };
  }
  if (Array.isArray(data.trigger)) {
    return {
      file: filePath,
      line: 2,
      rule: "rule/trigger-must-be-string",
      message:
        "Rule 'trigger' must be a single glob string, not a YAML sequence (array). Use brace expansion instead, for example: trigger: \"{package.json,bun.lock}\"",
      severity: "error",
    };
  }
  if (typeof data.trigger !== "string" || !data.trigger.trim()) {
    return {
      file: filePath,
      line: 2,
      rule: "rule/trigger-invalid",
      message: "Rule 'trigger' must be a non-empty glob string.",
      severity: "error",
    };
  }
  return null;
}

/**
 * Runs the standard suite of local Markdown body checks (fences, machine paths, links, unslop).
 */
function runLocalMarkdownChecks(
  content: string,
  bodyForLinks: string,
  filePath: string,
  repoRoot: string,
): Finding[] {
  return [
    ...checkCodeFences(content, filePath),
    ...checkMachinePaths(content, filePath),
    ...checkMarkdownLinks(bodyForLinks, filePath, repoRoot),
    ...checkUnslop(content, filePath),
  ];
}

/**
 * Validates a rule file (`.agents/rules/*.md`).
 *
 * @param filePath - Repository-relative path to the rule file.
 * @param content - Raw Markdown content of the rule file.
 * @param repoRoot - Repository root directory. Defaults to `process.cwd()`.
 * @returns Array of validation findings.
 */
export function validateRuleFile(
  filePath: string,
  content: string,
  repoRoot: string = process.cwd(),
): Finding[] {
  const fm = parseFrontmatter(content);
  const envelopeError = validateFrontmatterPresence(
    fm,
    filePath,
    "rule",
    "Rule file",
  );
  if (envelopeError) {
    return [envelopeError];
  }

  const data = fm.data ?? {};
  const findings: Finding[] = [];

  const triggerError = validateRuleTriggerField(data, filePath);
  if (triggerError) findings.push(triggerError);

  const descError = validateDescriptionField(data, filePath, "rule", "Rule");
  if (descError) findings.push(descError);

  findings.push(
    ...runLocalMarkdownChecks(content, fm.body, filePath, repoRoot),
  );
  return findings;
}

/**
 * Validates the `name` field in a `SKILL.md` frontmatter map.
 */
function validateSkillNameField(
  data: Record<string, unknown>,
  filePath: string,
  isVendor: boolean,
  skillDirName?: string,
): Finding | null {
  if (!data.name || typeof data.name !== "string") {
    return {
      file: filePath,
      line: 2,
      rule: "skill/name-required",
      message: "SKILL.md frontmatter must provide a 'name' string.",
      severity: "error",
    };
  }
  if (!isVendor && skillDirName && data.name !== skillDirName) {
    return {
      file: filePath,
      line: 2,
      rule: "skill/name-directory-mismatch",
      message: `Skill name '${data.name}' does not match directory name '${skillDirName}'.`,
      severity: "error",
    };
  }
  return null;
}

/**
 * Validates a skill file (`.agents/skills/<name>/SKILL.md` or supporting reference Markdown).
 *
 * @param filePath - Repository-relative path to the skill Markdown file.
 * @param content - Raw Markdown content of the skill file.
 * @param options - Vendor status, skill directory name, main-file flag, and repository root options.
 * @returns Array of validation findings.
 */
export function validateSkillFile(
  filePath: string,
  content: string,
  options: {
    isVendor: boolean;
    skillDirName?: string;
    isMainSkillFile?: boolean;
    repoRoot?: string;
  },
): Finding[] {
  const findings: Finding[] = [...checkCodeFences(content, filePath)];
  const repoRoot = options.repoRoot ?? process.cwd();
  const fm = parseFrontmatter(content);

  if (!options.isVendor) {
    findings.push(...checkMachinePaths(content, filePath));
  }

  if (options.isMainSkillFile) {
    const envelopeError = validateFrontmatterPresence(
      fm,
      filePath,
      "skill",
      "SKILL.md",
    );
    if (envelopeError) {
      return [...findings, envelopeError];
    }

    const data = fm.data ?? {};
    const nameError = validateSkillNameField(
      data,
      filePath,
      options.isVendor,
      options.skillDirName,
    );
    if (nameError) findings.push(nameError);

    const descError = validateDescriptionField(
      data,
      filePath,
      "skill",
      "SKILL.md",
    );
    if (descError) findings.push(descError);
  } else if (fm.exists && fm.error) {
    findings.push({
      file: filePath,
      line: fm.errorLine ?? 1,
      rule: "skill/frontmatter-syntax",
      message: fm.error,
      severity: "error",
    });
  }

  if (!options.isVendor) {
    findings.push(
      ...checkMarkdownLinks(fm.body || content, filePath, repoRoot),
      ...checkUnslop(content, filePath),
    );
  }

  return findings;
}

/**
 * Loads vendor-managed skill directory names from `skills-lock.json`.
 *
 * @param repoRoot - Repository root directory. Defaults to `process.cwd()`.
 * @returns Set of skill names declared in `skills-lock.json`.
 */
export function loadVendorSkillNames(
  repoRoot: string = process.cwd(),
): Set<string> {
  const lockPath = join(repoRoot, "skills-lock.json");
  if (!existsSync(lockPath)) {
    return new Set();
  }

  try {
    const raw = readFileSync(lockPath, "utf8");
    const parsed = JSON.parse(raw) as SkillsLock;
    return new Set(Object.keys(parsed.skills ?? {}));
  } catch (err: unknown) {
    console.warn(
      `⚠️ Warning: Failed to parse skills-lock.json: ${err instanceof Error ? err.message : String(err)}`,
    );
    return new Set();
  }
}

/**
 * Recursively discovers all `.md` files under `.agents/`.
 *
 * @param repoRoot - Repository root directory. Defaults to `process.cwd()`.
 * @returns Array of repository-relative `.md` paths under `.agents/`.
 */
export function discoverAgentFiles(repoRoot: string = process.cwd()): string[] {
  const discovered: string[] = [];
  const agentsDir = join(repoRoot, ".agents");
  if (!existsSync(agentsDir)) return discovered;

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".md")) {
        discovered.push(toRepoRelative(fullPath, repoRoot));
      }
    }
  }

  walk(agentsDir);
  return discovered;
}

/**
 * Resolves the list of `.agents/` Markdown files to validate.
 */
function resolveFilesToScan(
  targetFiles: string[] | undefined,
  repoRoot: string,
): string[] {
  if (!targetFiles || targetFiles.length === 0) {
    return discoverAgentFiles(repoRoot).filter((f) => f.endsWith(".md"));
  }
  return targetFiles
    .map((file) => toRepoRelative(file, repoRoot))
    .filter(
      (rel) =>
        rel.endsWith(".md") &&
        (rel.startsWith(".agents/rules/") ||
          rel.startsWith(".agents/skills/") ||
          rel === ".agents/AGENTS.md"),
    );
}

/**
 * Validates a single `.agents/` file based on its path category (`rules`, `skills`, or `AGENTS.md`).
 */
function validateSingleAgentFile(
  relFile: string,
  content: string,
  vendorSkills: Set<string>,
  repoRoot: string,
): Finding[] {
  if (relFile.startsWith(".agents/rules/")) {
    return validateRuleFile(relFile, content, repoRoot);
  }
  if (relFile.startsWith(".agents/skills/")) {
    const parts = relFile.split("/");
    const skillDirName = parts[2] ?? "";
    return validateSkillFile(relFile, content, {
      isVendor: vendorSkills.has(skillDirName),
      skillDirName,
      isMainSkillFile: parts[parts.length - 1] === "SKILL.md",
      repoRoot,
    });
  }
  if (relFile === ".agents/AGENTS.md") {
    return runLocalMarkdownChecks(content, content, relFile, repoRoot);
  }
  return [];
}

/**
 * Runs validation across specified or discovered `.agents/` Markdown files.
 *
 * @param targetFiles - Optional explicit list of file paths to validate. When omitted, scans all Markdown files under `.agents/`.
 * @param repoRoot - Repository root directory. Defaults to `process.cwd()`.
 * @returns Object containing all `findings` and `scannedCount`.
 */
export function verifyAgentRules(
  targetFiles?: string[],
  repoRoot: string = process.cwd(),
): { findings: Finding[]; scannedCount: number } {
  const vendorSkills = loadVendorSkillNames(repoRoot);
  const filesToScan = resolveFilesToScan(targetFiles, repoRoot);
  const findings: Finding[] = [];
  let scannedCount = 0;

  for (const relFile of filesToScan) {
    const absPath = resolve(repoRoot, relFile);
    if (!existsSync(absPath)) continue;

    scannedCount++;
    const content = readFileSync(absPath, "utf8");
    findings.push(
      ...validateSingleAgentFile(relFile, content, vendorSkills, repoRoot),
    );
  }

  return { findings, scannedCount };
}

/**
 * CLI execution entrypoint for `bun scripts/verify-agent-rules.ts`.
 */
export function run(): void {
  const startTime = performance.now();
  const repoRoot = process.cwd();
  const args = process.argv.slice(2);
  const targetFiles = args.length > 0 ? args : undefined;

  const { findings, scannedCount } = verifyAgentRules(targetFiles, repoRoot);
  const elapsed = (performance.now() - startTime).toFixed(1);

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");

  if (errors.length > 0) {
    console.error(
      `\n❌ Agent rules verification failed with ${errors.length} error(s) across ${scannedCount} file(s) in ${elapsed}ms:\n`,
    );

    for (const err of errors) {
      const loc = err.line ? `:${err.line}` : "";
      console.error(`  - ${err.file}${loc} [${err.rule}] ${err.message}`);
    }

    console.error(
      "\nTo resolve:\n" +
        "1. Fix YAML syntax errors (e.g. quote descriptions containing colons ': ').\n" +
        "2. Ensure all code fences ('```') are properly closed.\n" +
        "3. Replace machine absolute paths with repository-relative paths.\n" +
        "4. Vendor skills in skills-lock.json receive automatic exemptions for unslop and local link rules.\n",
    );
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn(
      `\n⚠️ ${warnings.length} warning(s) found during agent verification:`,
    );
    for (const w of warnings) {
      const loc = w.line ? `:${w.line}` : "";
      console.warn(`  - ${w.file}${loc} [${w.rule}] ${w.message}`);
    }
  }

  console.log(
    `✅ Agent skills and rules verification passed (${scannedCount} file(s) checked in ${elapsed}ms).`,
  );
}

if (import.meta.main) {
  run();
}
