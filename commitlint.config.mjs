const CLEAN_SCOPE_PATTERN = /^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/;

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
            'Commit subject contains an issue reference ("#123"). Track issues in pull request descriptions instead of commit subjects.',
          ];
        },
        "no-repo-scope": (parsed) => {
          const { scope } = parsed;
          if (!scope) return [true];
          const isRepo = scope.toLowerCase() === "repo";
          return [
            !isRepo,
            'Do not use "(repo)" as a scope. Omit the scope for root or cross-cutting changes (for example, "chore: ..." or "docs: ...").',
          ];
        },
        "clean-scope-syntax": (parsed) => {
          const { scope } = parsed;
          if (!scope) return [true];
          const isClean = CLEAN_SCOPE_PATTERN.test(scope);
          return [
            isClean,
            `Scope "${scope}" must be lowercase letters, numbers, hyphens, or a single "area/subarea" slash (no spaces or comma-separated scopes).`,
          ];
        },
      },
    },
  ],
  rules: {
    "no-issue-refs-in-subject": [2, "always"],
    "no-repo-scope": [2, "always"],
    "clean-scope-syntax": [2, "always"],
    "header-max-length": [2, "always", 72],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "perf",
        "revert",
        "docs",
        "style",
        "refactor",
        "test",
        "build",
        "ci",
        "chore",
      ],
    ],
  },
};
