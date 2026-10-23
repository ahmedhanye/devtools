import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { YAML } from "bun";

export interface Finding {
  file: string;
  line?: number;
  rule: string;
  message: string;
  severity: "error" | "warning";
}

export interface ParsedFrontmatter {
  exists: boolean;
  data: Record<string, unknown> | null;
  body: string;
  error?: string;
  errorLine?: number;
}

export interface SkillsLock {
  version?: number;
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

/**
 * Normalizes a path to be repository-relative using forward slashes.
 */
export function toRepoRelative(
  filePath: string,
  repoRoot: string = process.cwd(),
): string {
  const abs = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
  const rel = relative(repoRoot, abs).replace(/\\/g, "/");
  return rel;
}

/**
 * Parses YAML frontmatter delimited by `---`.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { exists: false, data: null, body: content };
  }

  // Find closing delimiter (--- on its own line)
  const lines = content.split("\n");
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingIndex = i;
      break;
    }
  }

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
    // Attempt to extract line number from parser error if present
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
 * Verifies code fences (``` or ````) are balanced.
 */
export function checkCodeFences(content: string, filePath: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");
  let insideFence = false;
  let fenceMarker = "";
  let openLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*)(`{3,})/);
    if (!match) continue;

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

  if (insideFence) {
    findings.push({
      file: filePath,
      line: openLine,
      rule: "code-fence/unclosed",
      message: `Unclosed code fence (${fenceMarker}) opened at line ${openLine}`,
      severity: "error",
    });
  }

  return findings;
}

/**
 * Checks for leaked local absolute machine paths (/home/, /Users/, etc.).
 * Allows explicitly documented fake placeholders (e.g. /path/to/...) or .scratch paths.
 */
export function checkMachinePaths(
  content: string,
  filePath: string,
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(MACHINE_PATH_REGEX);
    if (!matches) continue;

    for (const match of matches) {
      // Allow .scratch references (permitted for ephemeral local session artifacts)
      if (match.includes(".scratch")) continue;
      // Allow generic illustrative path templates
      if (match.includes("/path/to/")) continue;

      findings.push({
        file: filePath,
        line: i + 1,
        rule: "path-portability/no-absolute-machine-path",
        message: `Found leaked absolute machine path "${match}". Use repository-relative paths instead.`,
        severity: "error",
      });
    }
  }

  return findings;
}

/**
 * Validates local relative markdown links point to existing files on disk.
 */
export function checkMarkdownLinks(
  content: string,
  filePath: string,
  repoRoot: string = process.cwd(),
): Finding[] {
  const findings: Finding[] = [];
  const fileDir = dirname(resolve(repoRoot, filePath));
  const lines = content.split("\n");
  let insideFence = false;
  let fenceMarker = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      if (!insideFence) {
        insideFence = true;
        fenceMarker = marker;
      } else if (
        marker.length >= fenceMarker.length &&
        marker[0] === fenceMarker[0]
      ) {
        insideFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (insideFence) continue;

    // Ignore lines that are illustrative examples
    if (line.includes("for example,") || line.includes("For example,"))
      continue;

    const matches = Array.from(line.matchAll(MARKDOWN_LINK_REGEX));

    for (const match of matches) {
      // If the link is wrapped inside inline backticks `[text](url)`, it's a documentation example
      const fullMatch = match[0];
      const matchIndex = match.index ?? 0;
      const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : "";
      const afterChar =
        matchIndex + fullMatch.length < line.length
          ? line[matchIndex + fullMatch.length]
          : "";
      if (beforeChar === "`" && afterChar === "`") {
        continue;
      }

      const rawTargetWithTitle = match[2]?.trim();
      const rawTarget = rawTargetWithTitle?.split(/\s+["']/)[0]?.trim();
      if (!rawTarget) continue;

      // Ignore external URLs, anchors, mailto, URI schemes, image data URIs, or generic examples
      if (
        rawTarget.startsWith("http://") ||
        rawTarget.startsWith("https://") ||
        rawTarget.startsWith("mailto:") ||
        rawTarget.startsWith("file://") ||
        rawTarget.startsWith("#") ||
        rawTarget.startsWith("data:") ||
        rawTarget.startsWith("/docs/") ||
        rawTarget.startsWith("/path/to/") ||
        rawTarget.startsWith("path/to/") ||
        rawTarget === "url" ||
        rawTarget === "path"
      ) {
        continue;
      }

      // Strip query parameters and fragment anchors
      const cleanTarget = rawTarget.split("#")[0].split("?")[0];
      if (!cleanTarget) continue;

      // Relative targets resolve from the markdown file's directory.
      // Root-relative targets (starting with '/') resolve from the repo root.
      const resolvedPath = cleanTarget.startsWith("/")
        ? join(repoRoot, cleanTarget)
        : resolve(fileDir, cleanTarget);

      if (!existsSync(resolvedPath)) {
        findings.push({
          file: filePath,
          line: i + 1,
          rule: "markdown/broken-link",
          message: `Relative markdown link "${rawTarget}" points to non-existent path "${toRepoRelative(resolvedPath, repoRoot)}"`,
          severity: "error",
        });
      }
    }
  }

  return findings;
}

/**
 * Checks for prohibited unslop patterns (e.g. em dashes).
 */
export function checkUnslop(content: string, filePath: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("—")) {
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
 * Validates a rule file (.agents/rules/*.md).
 */
export function validateRuleFile(
  filePath: string,
  content: string,
  repoRoot: string = process.cwd(),
): Finding[] {
  const findings: Finding[] = [];
  const fm = parseFrontmatter(content);

  if (!fm.exists) {
    findings.push({
      file: filePath,
      line: 1,
      rule: "rule/frontmatter-missing",
      message: "Rule file must include YAML frontmatter delimited by '---'.",
      severity: "error",
    });
    return findings;
  }

  if (fm.error) {
    findings.push({
      file: filePath,
      line: fm.errorLine ?? 1,
      rule: "rule/frontmatter-syntax",
      message: fm.error,
      severity: "error",
    });
    return findings;
  }

  const data = fm.data ?? {};

  // Check trigger
  if (!data.trigger) {
    findings.push({
      file: filePath,
      line: 2,
      rule: "rule/trigger-required",
      message:
        "Rule frontmatter must define a 'trigger' string pattern (e.g. 'apps/frontend/**' or '{package.json,bun.lock}').",
      severity: "error",
    });
  } else if (Array.isArray(data.trigger)) {
    findings.push({
      file: filePath,
      line: 2,
      rule: "rule/trigger-must-be-string",
      message:
        "Rule 'trigger' must be a single glob string, not a YAML sequence (array). Use brace expansion instead, for example: trigger: \"{package.json,bun.lock}\"",
      severity: "error",
    });
  } else if (typeof data.trigger !== "string" || !data.trigger.trim()) {
    findings.push({
      file: filePath,
      line: 2,
      rule: "rule/trigger-invalid",
      message: "Rule 'trigger' must be a non-empty glob string.",
      severity: "error",
    });
  }

  // Check description
  if (
    !data.description ||
    typeof data.description !== "string" ||
    data.description.trim().length < 10
  ) {
    findings.push({
      file: filePath,
      line: 3,
      rule: "rule/description-required",
      message:
        "Rule frontmatter must define a 'description' string with at least 10 characters.",
      severity: "error",
    });
  }

  findings.push(...checkCodeFences(content, filePath));
  findings.push(...checkMachinePaths(content, filePath));
  findings.push(...checkMarkdownLinks(fm.body, filePath, repoRoot));
  findings.push(...checkUnslop(content, filePath));

  return findings;
}

/**
 * Validates a skill file (.agents/skills/<name>/SKILL.md or reference markdown).
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
  const findings: Finding[] = [];
  const repoRoot = options.repoRoot ?? process.cwd();
  const fm = parseFrontmatter(content);

  // Universal checks: Code fence integrity applies to all skills
  findings.push(...checkCodeFences(content, filePath));

  // Machine paths and local link graph checks only apply to local skills
  // (Vendor skills may contain upstream CI paths or external repo links)
  if (!options.isVendor) {
    findings.push(...checkMachinePaths(content, filePath));
  }

  if (options.isMainSkillFile) {
    if (!fm.exists) {
      findings.push({
        file: filePath,
        line: 1,
        rule: "skill/frontmatter-missing",
        message: "SKILL.md must include YAML frontmatter delimited by '---'.",
        severity: "error",
      });
      return findings;
    }

    if (fm.error) {
      findings.push({
        file: filePath,
        line: fm.errorLine ?? 1,
        rule: "skill/frontmatter-syntax",
        message: fm.error,
        severity: "error",
      });
      return findings;
    }

    const data = fm.data ?? {};

    // Universal validation: Both vendor and local skills must provide name and description
    if (!data.name || typeof data.name !== "string") {
      findings.push({
        file: filePath,
        line: 2,
        rule: "skill/name-required",
        message: "SKILL.md frontmatter must provide a 'name' string.",
        severity: "error",
      });
    } else if (
      !options.isVendor &&
      options.skillDirName &&
      data.name !== options.skillDirName
    ) {
      findings.push({
        file: filePath,
        line: 2,
        rule: "skill/name-directory-mismatch",
        message: `Skill name '${data.name}' does not match directory name '${options.skillDirName}'.`,
        severity: "error",
      });
    }

    if (
      !data.description ||
      typeof data.description !== "string" ||
      data.description.trim().length < 10
    ) {
      findings.push({
        file: filePath,
        line: 3,
        rule: "skill/description-required",
        message:
          "SKILL.md frontmatter must define a 'description' string with at least 10 characters.",
        severity: "error",
      });
    }
  } else if (fm.exists && fm.error) {
    findings.push({
      file: filePath,
      line: fm.errorLine ?? 1,
      rule: "skill/frontmatter-syntax",
      message: fm.error,
      severity: "error",
    });
  }

  // Local-only checks: Skip unslop and local link graph checks for vendor skills
  if (!options.isVendor) {
    findings.push(
      ...checkMarkdownLinks(fm.body || content, filePath, repoRoot),
    );
    findings.push(...checkUnslop(content, filePath));
  }

  return findings;
}

/**
 * Loads vendor skill names dynamically from skills-lock.json.
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
 * Collects all candidate rule and skill files under .agents.
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
 * Runs validation across specified or discovered agent files.
 */
export function verifyAgentRules(
  targetFiles?: string[],
  repoRoot: string = process.cwd(),
): { findings: Finding[]; scannedCount: number } {
  const vendorSkills = loadVendorSkillNames(repoRoot);
  const filesToScan: string[] = [];

  if (targetFiles && targetFiles.length > 0) {
    for (const file of targetFiles) {
      const rel = toRepoRelative(file, repoRoot);
      if (
        (rel.startsWith(".agents/rules/") ||
          rel.startsWith(".agents/skills/") ||
          rel === ".agents/AGENTS.md") &&
        rel.endsWith(".md")
      ) {
        filesToScan.push(rel);
      }
    }
  } else {
    const all = discoverAgentFiles(repoRoot);
    filesToScan.push(...all.filter((f) => f.endsWith(".md")));
  }

  const findings: Finding[] = [];
  let scannedCount = 0;

  for (const relFile of filesToScan) {
    const absPath = resolve(repoRoot, relFile);
    if (!existsSync(absPath)) continue;

    scannedCount++;
    const content = readFileSync(absPath, "utf8");

    if (relFile.startsWith(".agents/rules/")) {
      findings.push(...validateRuleFile(relFile, content, repoRoot));
    } else if (relFile.startsWith(".agents/skills/")) {
      const parts = relFile.split("/");
      // Path format: .agents/skills/<skill-dir>/...
      const skillDirName = parts[2] ?? "";
      const isVendor = vendorSkills.has(skillDirName);
      const isMainSkillFile = parts[parts.length - 1] === "SKILL.md";

      findings.push(
        ...validateSkillFile(relFile, content, {
          isVendor,
          skillDirName,
          isMainSkillFile,
          repoRoot,
        }),
      );
    } else if (relFile === ".agents/AGENTS.md") {
      findings.push(...checkCodeFences(content, relFile));
      findings.push(...checkMachinePaths(content, relFile));
      findings.push(...checkMarkdownLinks(content, relFile, repoRoot));
      findings.push(...checkUnslop(content, relFile));
    }
  }

  return { findings, scannedCount };
}

/**
 * CLI execution entrypoint.
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
