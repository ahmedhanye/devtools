#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import {
  ALLOWED_UNSCOPED_TYPES,
  SCOPES,
  TYPE_SCOPE_MATRIX,
} from "./scopes.mjs";

/**
 * Atomic Commit and Scope Boundary Validator
 *
 * Enforces atomic change boundaries defined in docs/contributing/commits.md:
 * 1. Single-domain isolation: Staged files must strictly belong to the commit's declared scope.
 * 2. Separation of concerns: Never mix documentation, internal rules, and runtime code into one commit.
 * 3. Lockfile separation: Vendor/lockfile updates (bun.lock) must not be mixed with runtime feature code.
 * 4. Required scoping for runtime code: feat/fix commits modifying apps or packages must declare their scope.
 * 5. Type-Scope matrix compatibility: Commit type must strictly align with the scope (e.g. agents -> docs only).
 */

export interface ParsedCommitHeader {
  type: string;
  scope: string | null;
  subject: string;
  rawHeader: string;
}

export interface ClassifiedFile {
  file: string;
  domain: string;
  scope: string | null;
}

export interface ClassificationContext {
  commitScope?: string | null;
  hasLockfile?: boolean;
}

export interface ValidationViolation {
  rule: string;
  message: string;
  violatingFiles: string[];
  remediation?: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
  scope: string | null;
  type: string;
  stagedFiles: string[];
}

interface ScopeEntry {
  domain: string;
  regex: RegExp;
}

const COMPILED_SCOPES: Record<string, ScopeEntry> = Object.fromEntries(
  Object.entries(SCOPES).map(([scope, def]) => [
    scope,
    { domain: def.domain, regex: new RegExp(def.pattern) },
  ]),
);

const ROOT_CONFIG_FILES = new Set([
  ".coderabbit.yaml",
  ".env.example",
  ".fallow/.gitignore",
  ".fallowrc.json",
  ".gitignore",
  ".oxlintrc.json",
  ".prettierignore",
  ".prettierrc",
  ".release-please-manifest.json",
  "bunfig.toml",
  "commitlint.config.mjs",
  "lefthook.yml",
  "LICENSE",
  "package.json",
  "release-please-config.json",
  "tsconfig.base.json",
]);

const ROOT_DOC_PATTERN = /^[A-Za-z0-9_.-]+\.md$/;

/**
 * Determines whether a file path is a test file or test support asset.
 * Excludes documentation (*.md) and configuration files (e.g. vitest.config.ts).
 */
export function isTestFile(filePath: string): boolean {
  const normalized = filePath.trim().replace(/^\.\//, "");
  if (normalized.endsWith(".md") || normalized.endsWith(".mdx")) {
    return false;
  }
  if (
    /(?:^|\/)vitest\.config\.[a-z]+$/.test(normalized) ||
    /(?:^|\/)jest\.config\.[a-z]+$/.test(normalized)
  ) {
    return false;
  }
  if (/\.(?:test|spec)\.[a-z0-9]+$/i.test(normalized)) {
    return true;
  }
  if (/(?:^|\/)(?:tests|__tests__)\//.test(normalized)) {
    return true;
  }
  return false;
}

/**
 * Classifies a repository-relative file path into a domain and scope.
 */
export function classifyFile(
  filePath: string,
  context?: ClassificationContext,
): ClassifiedFile {
  const normalized = filePath.trim().replace(/^\.\//, "");

  // 1. Dependency updates and lockfiles
  if (normalized === "bun.lock") {
    return { file: normalized, domain: "deps", scope: "deps" };
  }

  const isManifest =
    normalized === "package.json" || normalized.endsWith("/package.json");

  if (isManifest) {
    // When the commit scope is 'deps' OR bun.lock is staged in the same changeset,
    // all package manifests belong to domain 'deps'.
    if (context?.commitScope === "deps" || context?.hasLockfile) {
      return { file: normalized, domain: "deps", scope: "deps" };
    }
  }

  // 2. Match against configured scopes (excluding deps handled above)
  for (const [scope, entry] of Object.entries(COMPILED_SCOPES)) {
    if (scope === "deps") continue;
    if (entry.regex.test(normalized)) {
      return { file: normalized, domain: entry.domain, scope };
    }
  }

  // Root package manifest without lockfile and without deps scope
  if (normalized === "package.json") {
    return { file: normalized, domain: "root-config", scope: null };
  }

  // 3. Documentation files (sub-scopes or general docs/*)
  if (normalized.startsWith("docs/")) {
    return { file: normalized, domain: "docs", scope: null };
  }

  // Root documentation files
  if (ROOT_DOC_PATTERN.test(normalized)) {
    return { file: normalized, domain: "docs", scope: null };
  }

  // 4. Root configuration files
  if (ROOT_CONFIG_FILES.has(normalized)) {
    return { file: normalized, domain: "root-config", scope: null };
  }

  // 5. Unrecognized files
  return { file: normalized, domain: "unknown", scope: null };
}

/**
 * Parses the commit message string, ignoring git comment lines.
 */
export function parseCommitMessage(
  rawMessage: string,
): ParsedCommitHeader | null {
  const lines = rawMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length === 0) {
    return null;
  }

  const header = lines[0];
  const match = header.match(
    /^(?<type>[a-z]+)(?:\((?<scope>[a-z0-9_-]+)\))?(?<breaking>!)?:\s+(?<subject>.+)$/,
  );

  if (!match || !match.groups) {
    return null;
  }

  return {
    type: match.groups.type,
    scope: match.groups.scope ?? null,
    subject: match.groups.subject,
    rawHeader: header,
  };
}

/**
 * Validates staged files against Conventional Commit header under atomic change rules.
 */
export function validateAtomicCommit(
  header: ParsedCommitHeader,
  stagedFiles: string[],
): ValidationResult {
  const violations: ValidationViolation[] = [];
  const normalizedFiles = stagedFiles
    .map((f) => f.trim().replace(/^\.\//, ""))
    .filter((f) => f.length > 0);

  if (normalizedFiles.length === 0) {
    return {
      valid: true,
      violations: [],
      scope: header.scope,
      type: header.type,
      stagedFiles: [],
    };
  }

  const { scope, type } = header;
  const hasLockfile = normalizedFiles.includes("bun.lock");
  const context: ClassificationContext = {
    commitScope: scope,
    hasLockfile,
  };

  const classified = normalizedFiles.map((f) => classifyFile(f, context));

  // 0. Check for unrecognized files
  const unknownFiles = classified.filter((c) => c.domain === "unknown");
  if (unknownFiles.length > 0) {
    violations.push({
      rule: "atomic/unrecognized-domain",
      message:
        `Unrecognized file(s) found in commit:\n` +
        unknownFiles.map((c) => `  • ${c.file}`).join("\n") +
        `\n\nPer docs/contributing/commits.md, files must belong to mapped package, doc, or system scopes.`,
      violatingFiles: unknownFiles.map((c) => c.file),
      remediation: `Review and unstage unrecognized assets:\n  git reset HEAD ${unknownFiles.map((c) => c.file).join(" ")}`,
    });
  }

  // 1. Single-domain isolation when scope is declared
  if (scope && COMPILED_SCOPES[scope]) {
    const scopeEntry = COMPILED_SCOPES[scope];
    const nonMatching = classified.filter(
      (c) => c.scope !== scope && !scopeEntry.regex.test(c.file),
    );

    if (nonMatching.length > 0) {
      const fileList = nonMatching
        .map((c) => `  • ${c.file} (maps to scope "${c.scope ?? c.domain}")`)
        .join("\n");

      violations.push({
        rule: "atomic/single-domain-isolation",
        message:
          `Commit scope is "(${scope})", but staged files contain changes outside its domain:\n` +
          fileList +
          `\n\nPer docs/contributing/commits.md, stage only files belonging to the mapped scope of the commit.`,
        violatingFiles: nonMatching.map((c) => c.file),
        remediation: `Unstage non-matching files:\n  git reset HEAD ${nonMatching.map((c) => c.file).join(" ")}`,
      });
    }

    // 1b. Type-Scope Matrix Validation directly from the matrix data
    const allowedTypes =
      TYPE_SCOPE_MATRIX[scope as keyof typeof TYPE_SCOPE_MATRIX];
    if (allowedTypes && !allowedTypes.includes(type)) {
      violations.push({
        rule: "atomic/type-scope-matrix",
        message:
          `Scope "(${scope})" only permits types [${allowedTypes.join(", ")}].\n` +
          `Received "${type}(${scope}): ${header.subject}".`,
        violatingFiles: classified.map((c) => c.file),
        remediation: `Use an allowed type for scope "(${scope})", e.g. ${allowedTypes[0]}(${scope}): ${header.subject}`,
      });
    }
  }

  // 2. Separation of concerns: Staged files must not span multiple disjoint domains
  const distinctDomains = [
    ...new Set(
      classified
        .map((c) => c.domain)
        .filter((d) => d !== "root-config" && d !== "unknown"),
    ),
  ];

  if (distinctDomains.length > 1) {
    const domainSummary = distinctDomains
      .map((domain) => {
        const files = classified.filter((c) => c.domain === domain);
        return (
          `  • Domain [${domain.toUpperCase()}] (${files.length} file(s)):\n` +
          files.map((c) => `      - ${c.file}`).join("\n")
        );
      })
      .join("\n");

    violations.push({
      rule: "atomic/separation-of-concerns",
      message:
        `Never mix changes across disjoint domains in a single commit.\n` +
        `Staged files span ${distinctDomains.length} conflicting domains:\n` +
        domainSummary +
        `\n\nPer docs/contributing/commits.md, divide changes into separate atomic commits.`,
      violatingFiles: classified
        .filter((c) => distinctDomains.includes(c.domain))
        .map((c) => c.file),
      remediation: `Unstage conflicting files before committing (stage one domain at a time).`,
    });
  }

  // 3. Separate vendor/lockfile updates from feature code
  const lockfiles = classified.filter((c) => c.file === "bun.lock");
  if (lockfiles.length > 0 && type === "feat") {
    violations.push({
      rule: "atomic/no-lockfile-in-feature",
      message:
        "Vendor and lockfile updates (bun.lock) must be separated from feature code.\n" +
        "Commit dependency updates separately under chore(deps) or fix(deps).",
      violatingFiles: ["bun.lock"],
      remediation: "Unstage lockfile:\n  git reset HEAD bun.lock",
    });
  }

  // 4. Require explicit scope when feat/fix touches runtime code
  if (
    !scope &&
    (type === "feat" || type === "fix") &&
    distinctDomains.includes("runtime")
  ) {
    const runtimeFiles = classified.filter((c) => c.domain === "runtime");
    const inferredScopes = [
      ...new Set(runtimeFiles.map((c) => c.scope).filter(Boolean)),
    ];
    const scopeHint =
      inferredScopes.length === 1 ? `(${inferredScopes[0]})` : "(<scope>)";

    violations.push({
      rule: "atomic/runtime-scope-required",
      message:
        `Runtime code changes (${type}) must declare an explicit scope mapping to the package or app.\n` +
        `Example: ${type}${scopeHint}: ${header.subject}`,
      violatingFiles: runtimeFiles.map((c) => c.file),
      remediation: `Amend commit message with appropriate scope, e.g. ${type}${scopeHint}: ...`,
    });
  }

  // 5. When commit is unscoped, enforce allowed unscoped types and prevent editing internal scoped systems
  if (!scope) {
    const internalScopedFiles = classified.filter(
      (c) => c.scope === "agents" || c.scope === "ci" || c.scope === "scripts",
    );
    if (internalScopedFiles.length > 0) {
      const distinctScopes = [
        ...new Set(internalScopedFiles.map((c) => c.scope)),
      ];
      const suggestedScope =
        distinctScopes.length === 1 ? distinctScopes[0] : "<scope>";
      violations.push({
        rule: "atomic/scope-required-for-domain",
        message:
          `Changes touching internal systems (.agents/, .github/, scripts/) must declare an explicit scope.\n` +
          `Staged file(s) map to scope "${suggestedScope}":\n` +
          internalScopedFiles.map((c) => `  • ${c.file}`).join("\n"),
        violatingFiles: internalScopedFiles.map((c) => c.file),
        remediation: `Amend commit message with scope: "${type}(${suggestedScope}): ${header.subject}"`,
      });
    }

    if (!ALLOWED_UNSCOPED_TYPES.includes(type)) {
      violations.push({
        rule: "atomic/unscoped-type-invalid",
        message:
          `Unscoped commits only allow types [${ALLOWED_UNSCOPED_TYPES.join(", ")}].\n` +
          `Received "${type}: ${header.subject}".`,
        violatingFiles: classified.map((c) => c.file),
        remediation: `Use an allowed type for unscoped commits, or provide a scope.`,
      });
    }
  }

  // 6. Test isolation: test files (*.test.ts or tests/**) must belong to test commits only.
  // Revert commits are exempt as they may roll back multi-file changesets.
  if (type !== "revert") {
    if (type === "test") {
      const nonTestFiles = classified.filter((c) => !isTestFile(c.file));
      if (nonTestFiles.length > 0) {
        violations.push({
          rule: "atomic/test-isolation",
          message:
            `Commit type "test" can only include test files and test helpers (*.test.ts or tests/**).\n` +
            `Found non-test file(s):\n` +
            nonTestFiles.map((c) => `  • ${c.file}`).join("\n") +
            `\n\nPer docs/contributing/commits.md, stage production source changes separately under feat, fix, chore, or refactor.`,
          violatingFiles: nonTestFiles.map((c) => c.file),
          remediation: `Unstage non-test files:\n  git reset HEAD ${nonTestFiles.map((c) => c.file).join(" ")}`,
        });
      }
    } else {
      const testFiles = classified.filter((c) => isTestFile(c.file));
      if (testFiles.length > 0) {
        violations.push({
          rule: "atomic/test-isolation",
          message:
            `Commit type "${type}" cannot contain test files (*.test.ts or tests/**).\n` +
            `Found test file(s):\n` +
            testFiles.map((c) => `  • ${c.file}`).join("\n") +
            `\n\nPer docs/contributing/commits.md, stage test files separately under the "test" commit type (e.g. test(${scope ?? "<scope>"}): <description>).`,
          violatingFiles: testFiles.map((c) => c.file),
          remediation: `Unstage test files:\n  git reset HEAD ${testFiles.map((c) => c.file).join(" ")}`,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    scope,
    type,
    stagedFiles: classified.map((c) => c.file),
  };
}

export type StagedFilesRunner = (cmd: string[]) => {
  exitCode: number;
  stdout: Buffer | string;
  stderr?: Buffer | string;
};

/**
 * Retrieves staged files from git index using `git diff --cached --no-renames --name-only -z`.
 */
export function getStagedFiles(
  diffRunner: StagedFilesRunner = (cmd) => Bun.spawnSync(cmd as any),
): string[] {
  try {
    const proc = diffRunner([
      "git",
      "diff",
      "--cached",
      "--no-renames",
      "--name-only",
      "-z",
    ]);

    if (proc.exitCode !== 0) {
      console.error(
        `❌ Failed to query staged files (exit code ${proc.exitCode}): ${proc.stderr?.toString() ?? ""}`,
      );
      process.exit(1);
    }

    const output = proc.stdout.toString();
    return output
      .split("\0")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  } catch (err) {
    console.error("❌ Exception while executing git diff:", err);
    process.exit(1);
  }
}

/**
 * Resolves the commit message file path dynamically, supporting linked Git worktrees.
 */
export function resolveCommitMsgPath(explicitPath?: string): string {
  if (explicitPath) return explicitPath;
  if (process.argv[2]) return process.argv[2];
  try {
    const proc = Bun.spawnSync(["git", "rev-parse", "--git-dir"]);
    if (proc.exitCode === 0) {
      const gitDir = proc.stdout.toString().trim();
      return `${gitDir}/COMMIT_EDITMSG`;
    }
  } catch {
    // fallback
  }
  return ".git/COMMIT_EDITMSG";
}

/**
 * Detects git auto-generated or tooling commits (merge, revert, fixup, squash, amend)
 * that should bypass conventional commit and atomic file boundary rules.
 */
export function isAutoGeneratedCommit(rawContent: string): boolean {
  const firstLine =
    rawContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith("#")) ?? "";
  return /^(Merge |Revert ["']|Revert |fixup! |squash! |amend! )/.test(
    firstLine,
  );
}

/**
 * Main execution routine.
 */
function run(commitMsgArg?: string): void {
  const arg = commitMsgArg ?? process.argv[2];
  let rawContent: string | null = null;

  if (arg) {
    if (existsSync(arg)) {
      rawContent = readFileSync(arg, "utf-8");
    } else {
      // Direct commit message string passed (e.g. "feat(core): add feature")
      rawContent = arg;
    }
  } else {
    const commitMsgPath = resolveCommitMsgPath();
    if (!existsSync(commitMsgPath)) {
      console.error(
        "\n❌ Atomic Commit Error: No commit message provided.\n" +
          "Usage: bun scripts/verify-atomic-commit/verify-atomic-commit.ts <path-to-commit-msg | 'commit-header'>\n",
      );
      process.exit(1);
    }
    rawContent = readFileSync(commitMsgPath, "utf-8");
  }

  if (isAutoGeneratedCommit(rawContent)) {
    return;
  }

  const parsed = parseCommitMessage(rawContent);

  if (!parsed) {
    console.error(
      "\n❌ Atomic Commit Violation: Failed to parse commit message as a Conventional Commit.\n" +
        "Header must follow '<type>[optional (<single-noun-scope>)]: <description>'.\n",
    );
    process.exit(1);
  }

  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    return;
  }

  const result = validateAtomicCommit(parsed, stagedFiles);

  if (!result.valid) {
    console.error(
      "\n❌ Atomic Commit Violation: Staged changes violate domain boundaries:\n",
    );
    for (const v of result.violations) {
      console.error(`[${v.rule}]`);
      console.error(v.message);
      if (v.remediation) {
        console.error(`\nRemediation:\n${v.remediation}\n`);
      }
      console.error("─".repeat(60));
    }
    console.error(
      "\nReference: docs/contributing/commits.md (Single-domain isolation & Atomic commits)\n",
    );
    process.exit(1);
  }

  const scopeLabel = result.scope ? `(${result.scope})` : "root/cross-cutting";
  console.log(
    `✅ Atomic commit boundaries verified: ${result.stagedFiles.length} file(s) isolated to ${scopeLabel}.`,
  );
}

if (import.meta.main) {
  run();
}
