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
      },
    },
  ],
  rules: {
    "no-issue-refs-in-subject": [2, "always"],
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
        "ci",
        "revert",
      ],
    ],
  },
};
