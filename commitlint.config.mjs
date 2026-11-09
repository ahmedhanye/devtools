import {
  ALLOWED_SCOPES,
  ALLOWED_UNSCOPED_TYPES,
  TYPE_SCOPE_MATRIX,
} from "./scripts/verify-atomic-commit/scopes.mjs";

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "no-issue-refs-in-subject": (parsed) => {
          const { subject } = parsed;
          if (!subject) return [true];
          const hasIssueRef = /(?:^|\s|\()#\d+\b/.test(subject);
          return [
            !hasIssueRef,
            'Commit subject contains an issue reference ("#123"). Per CONTRIBUTING.md, issue tracking is handled at the Pull Request level, not in commit subjects.',
          ];
        },
        "no-repo-scope": (parsed) => {
          const { scope } = parsed;
          if (!scope) return [true];
          const isRepo = scope.toLowerCase() === "repo";
          return [
            !isRepo,
            'Do not use "(repo)" as a scope. Per docs/contributing/commits.md, omit the scope entirely for root configurations and cross-cutting maintenance (e.g. chore: ..., docs: ...).',
          ];
        },
        "single-noun-scope": (parsed) => {
          const { scope } = parsed;
          if (!scope) return [true];
          const isMultiple = /[,/]/.test(scope);
          return [
            !isMultiple,
            `Scope "${scope}" contains multiple scopes. Scope must be a single noun mapping to a physical directory. Separate changes into atomic commits or stack pull requests.`,
          ];
        },
        "type-scope-matrix": (parsed) => {
          const { type, scope } = parsed;
          if (!type) return [true];

          // 1. Unscoped commits
          if (!scope) {
            const isAllowed = ALLOWED_UNSCOPED_TYPES.includes(type);
            return [
              isAllowed,
              `Unscoped commits only permit types [${ALLOWED_UNSCOPED_TYPES.join(", ")}]. Received "${type}:". For scoped work, use "<type>(<scope>): <description>".`,
            ];
          }

          // 2. Scoped commits: lookup directly from TYPE_SCOPE_MATRIX table
          const allowedTypes = TYPE_SCOPE_MATRIX[scope];
          if (!allowedTypes) {
            // scope-enum handles unrecognized scopes
            return [true];
          }

          const isValid = allowedTypes.includes(type);
          return [
            isValid,
            `Scope "(${scope})" only permits types [${allowedTypes.join(", ")}]. Received "${type}(${scope}):".`,
          ];
        },
      },
    },
  ],
  rules: {
    "no-issue-refs-in-subject": [2, "always"],
    "no-repo-scope": [2, "always"],
    "single-noun-scope": [2, "always"],
    "type-scope-matrix": [2, "always"],
    "header-max-length": [2, "always", 72],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "chore",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "revert",
      ],
    ],
    "scope-enum": [2, "always", ALLOWED_SCOPES],
  },
};
