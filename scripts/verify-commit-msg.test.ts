import { describe, expect, it } from "bun:test";
import { ALLOWED_TYPES, validateCommitMessage } from "./verify-commit-msg";

describe("validateCommitMessage", () => {
  it("exports expected conventional commit allowed types", () => {
    expect(ALLOWED_TYPES).toEqual([
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
    ]);
  });
  it("accepts valid conventional commit messages with scope", () => {
    expect(
      validateCommitMessage("feat(server): add initial health check endpoint")
        .valid,
    ).toBe(true);
    expect(
      validateCommitMessage(
        "fix(web): resolve layout shift on mobile viewports",
      ).valid,
    ).toBe(true);
    expect(
      validateCommitMessage("chore(ci): update workflow dependencies").valid,
    ).toBe(true);
  });

  it("accepts valid conventional commit messages without scope", () => {
    expect(validateCommitMessage("feat: add new feature").valid).toBe(true);
    expect(validateCommitMessage("fix: resolve null pointer").valid).toBe(true);
    expect(validateCommitMessage("docs: update readme").valid).toBe(true);
  });

  it("accepts breaking change exclamation marks", () => {
    expect(
      validateCommitMessage("feat(api)!: drop deprecated endpoints").valid,
    ).toBe(true);
    expect(validateCommitMessage("refactor!: rewrite core router").valid).toBe(
      true,
    );
  });

  it("accepts automatic git merge commits", () => {
    expect(
      validateCommitMessage("Merge branch 'main' into feature").valid,
    ).toBe(true);
    expect(
      validateCommitMessage("Merge pull request #12 from branch").valid,
    ).toBe(true);
    expect(validateCommitMessage("Merge tag 'v1.0.0' into main").valid).toBe(
      true,
    );
    expect(
      validateCommitMessage(
        "Merge remote-tracking branch 'origin/main' into main",
      ).valid,
    ).toBe(true);
  });

  it("rejects informal non-conventional merge commits", () => {
    expect(validateCommitMessage("Merge fixes").valid).toBe(false);
    expect(validateCommitMessage("Merge changes from review").valid).toBe(
      false,
    );
  });

  it("accepts commit subjects containing hex colors without false positive issue detection", () => {
    expect(
      validateCommitMessage("feat(ui): set background color to #ffffff").valid,
    ).toBe(true);
    expect(
      validateCommitMessage("fix(ui): adjust contrast for #123abc border")
        .valid,
    ).toBe(true);
  });

  it("rejects commit subjects containing PR/issue references per CONTRIBUTING.md", () => {
    const result = validateCommitMessage(
      "feat(server): add initial health check endpoint (#123)",
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("issue reference");

    const inlineResult = validateCommitMessage(
      "fix(server): resolve timeout issue #45",
    );
    expect(inlineResult.valid).toBe(false);
    expect(inlineResult.error).toContain("issue reference");
  });

  it("rejects non-conventional commit messages", () => {
    expect(validateCommitMessage("added stuff").valid).toBe(false);
    expect(validateCommitMessage("WIP: testing").valid).toBe(false);
    expect(validateCommitMessage("update readme").valid).toBe(false);
    expect(validateCommitMessage("FIX: typo").valid).toBe(false);
  });

  it("ignores git comment lines and whitespace", () => {
    const multiLine = `# Please enter the commit message for your changes.
# Lines starting with '#' will be ignored.

feat(db): add users table schema

Detailed description here...
`;
    expect(validateCommitMessage(multiLine).valid).toBe(true);
  });
});
