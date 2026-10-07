import { readFileSync } from "node:fs";

export const ALLOWED_TYPES = [
  "feat",
  "fix",
  "chore",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "revert",
] as const;

const CONVENTIONAL_REGEX = new RegExp(
  `^(${ALLOWED_TYPES.join("|")})(\\([a-zA-Z0-9_\\-./]+\\))?(!)?: (.+)$`,
);

const ISSUE_REF_REGEX = /(?:^|\s|\()#\d+\b/;

const ALLOWED_MERGE_PREFIXES = [
  "Merge branch ",
  "Merge pull request ",
  "Merge tag ",
  "Merge remote-tracking branch ",
] as const;

export interface ValidationResult {
  valid: boolean;
  error?: string;
  subject?: string;
}

export function validateCommitMessage(content: string): ValidationResult {
  const lines = content.split("\n");
  const firstNonCommentLine = lines.find(
    (line) => !line.trim().startsWith("#") && line.trim().length > 0,
  );

  if (!firstNonCommentLine) {
    return {
      valid: false,
      error: "Commit message cannot be empty.",
    };
  }

  const subject = firstNonCommentLine.trim();

  // Allow automatic merge commits
  if (ALLOWED_MERGE_PREFIXES.some((prefix) => subject.startsWith(prefix))) {
    return { valid: true, subject };
  }

  // Reject issue references in commit subject per CONTRIBUTING.md
  if (ISSUE_REF_REGEX.test(subject)) {
    return {
      valid: false,
      subject,
      error: `Commit subject contains an issue reference ("#123"). Per CONTRIBUTING.md, issue tracking is handled at the Pull Request level, not in commit subjects.`,
    };
  }

  if (!CONVENTIONAL_REGEX.test(subject)) {
    return {
      valid: false,
      subject,
      error: `Commit subject does not follow Conventional Commits format:\n  Expected: <type>(<scope>): <imperative description>\n  Found:    "${subject}"\n  Allowed types: ${ALLOWED_TYPES.join(", ")}\n  Examples:  feat(server): add initial health check endpoint\n             fix(web): resolve layout shift on mobile viewports\n             chore(ci): update workflow dependencies`,
    };
  }

  return { valid: true, subject };
}

function run(): void {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(
      "Error: Commit message file path required as first argument.",
    );
    process.exit(1);
  }

  let content = "";
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    console.error(`Error reading commit message file at ${filePath}:`, err);
    process.exit(1);
  }

  const result = validateCommitMessage(content);
  if (!result.valid) {
    console.error(`\n❌ Invalid Commit Message:\n${result.error}\n`);
    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}
