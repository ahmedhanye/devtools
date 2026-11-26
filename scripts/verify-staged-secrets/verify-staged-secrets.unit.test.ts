import { describe, expect, it, spyOn } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeShannonEntropy,
  scanContentForSecrets,
  maskSecret,
  isIgnoredLine,
  parseStagedFilesOutput,
  toRepoRelativePath,
  getStagedFiles,
  getStagedDeletedFiles,
  readStagedContent,
  readPrePushStdin,
  parsePrePushRefs,
  resolvePushRange,
  resolvePushRanges,
  scanCommitRangeWithTrufflehog,
  scanCommitRangeFallback,
  run,
  runRangeScan,
} from "./verify-staged-secrets";

describe("isIgnoredLine", () => {
  it("detects trufflehog:ignore in various comment styles", () => {
    expect(
      isIgnoredLine("const key = 'AKIA1234567890123456'; // trufflehog:ignore"),
    ).toBe(true);
    expect(
      isIgnoredLine("AWS_KEY: AKIA1234567890123456 # trufflehog:ignore"),
    ).toBe(true);
    expect(isIgnoredLine("/* trufflehog:ignore */ const key = '...';")).toBe(
      true,
    );
    expect(isIgnoredLine("<!-- trufflehog:ignore -->")).toBe(true);
    expect(
      isIgnoredLine("const key = 'AKIA1234567890123456';"), // trufflehog:ignore
    ).toBe(false);
  });
});

describe("maskSecret", () => {
  it("masks secret while keeping prefix visible", () => {
    const awsSample = "AKIAIOSFODNN7EXAMPLE"; // trufflehog:ignore
    expect(maskSecret(awsSample)).toBe("AKIAIO**************");
    const ghpSample = "ghp_123456789012345678901234567890123456"; // trufflehog:ignore
    expect(maskSecret(ghpSample)).toBe(
      "ghp_12**********************************",
    );
    expect(maskSecret("short")).toBe("*****");
    expect(maskSecret("12345678")).toBe("********");
    expect(maskSecret("123456789")).toBe("123******");
  });
});

describe("scanContentForSecrets", () => {
  it("detects unsuppressed AWS access key IDs", () => {
    const awsKey = "AKIAIOSFODNN7EXAMPLE"; // trufflehog:ignore
    const content = `\nconst awsKey = "${awsKey}";\nconsole.log(awsKey);\n`;
    const findings = scanContentForSecrets(content, "test.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("AWS Access Key ID");
    expect(findings[0]?.line).toBe(2);
  });

  it("suppresses AWS access key IDs with trufflehog:ignore", () => {
    const awsKey = "AKIAIOSFODNN7EXAMPLE"; // trufflehog:ignore
    const content = `\nconst awsKey = "${awsKey}"; // trufflehog:ignore\nconsole.log(awsKey);\n`;
    const findings = scanContentForSecrets(content, "test.ts");
    expect(findings).toHaveLength(0);
  });

  it("detects GitHub personal access tokens", () => {
    const fakeToken = "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // trufflehog:ignore
    const content = `GITHUB_TOKEN=${fakeToken}`;
    const findings = scanContentForSecrets(content, ".env.example");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("GitHub Personal Access Token");
  });

  it("suppresses GitHub token with hash comment trufflehog:ignore", () => {
    const fakeToken = "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // trufflehog:ignore
    const content = `GITHUB_TOKEN=${fakeToken} # trufflehog:ignore`;
    const findings = scanContentForSecrets(content, ".env.example");
    expect(findings).toHaveLength(0);
  });

  it("detects Slack bot/user tokens", () => {
    const slackToken = "xoxb-dummytesttokendonotuse1234"; // trufflehog:ignore
    const content = `const slack = "${slackToken}";`;
    const findings = scanContentForSecrets(content, "slack.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("Slack Token");
  });

  it("detects OpenAI API keys", () => {
    const openAiKey = "sk-proj-abcdefghijklmnopqrstuvwxyz01234567890123456789"; // trufflehog:ignore
    const content = `const openAi = "${openAiKey}";`;
    const findings = scanContentForSecrets(content, "ai.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("OpenAI API Key");
  });

  it("detects Stripe secret keys", () => {
    const stripeKey = "sk_test_51Abcdefghijklmnopqrstuvwx"; // trufflehog:ignore
    const content = `const stripe = "${stripeKey}";`;
    const findings = scanContentForSecrets(content, "stripe.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("Stripe API Key");
  });

  it("detects private keys", () => {
    const privateKey =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----"; // trufflehog:ignore
    const findings = scanContentForSecrets(privateKey, "key.pem");
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.rule).toBe("Private Key");
  });

  it("allows synthetic mock credentials with mock_ prefix or zeros", () => {
    const content = `
const mockKey = "mock_sk_test_123456789012345678901234567890";
const dummy = "AKIA0000000000000000"; // trufflehog:ignore
const zeros = "00000000000000000000000000000000";
`;
    const findings = scanContentForSecrets(content, "mock.ts");
    expect(findings).toHaveLength(0);
  });

  it("detects Anthropic, Google Cloud, npm, SendGrid, PyPI, database URI, and JWT credentials", () => {
    const anthropicKey =
      "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD"; // trufflehog:ignore
    const gcpKey = `AIza${"a".repeat(35)}`; // trufflehog:ignore
    const npmToken = "npm_1234567890abcdefghijklmnopqrstuvwxyz"; // trufflehog:ignore
    const sendgridKey =
      "SG.abcdefghijklmnopqrstuv.abcdefghijklmnopqrstuvwxyz01234567890123456"; // trufflehog:ignore
    const pypiToken = `pypi-AgEIcHlwaS5vcmc${"a".repeat(52)}`; // trufflehog:ignore
    const dbUri =
      "postgresql://appuser:s3cr3tP4ssw0rd@db.example.com:5432/prod"; // trufflehog:ignore
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"; // trufflehog:ignore

    const content = [
      `ANTHROPIC_API_KEY=${anthropicKey}`,
      `GCP_KEY=${gcpKey}`,
      `NPM_TOKEN=${npmToken}`,
      `SENDGRID_API_KEY=${sendgridKey}`,
      `PYPI_TOKEN=${pypiToken}`,
      `DATABASE_URL="${dbUri}"`,
      `JWT="${jwt}"`,
    ].join("\n");

    const findings = scanContentForSecrets(content, "secrets.env");
    expect(findings.map((f) => f.rule)).toEqual([
      "Anthropic API Key",
      "Google Cloud / Firebase API Key",
      "npm Access Token",
      "SendGrid API Key",
      "PyPI API Token",
      "Database Connection URI",
      "JSON Web Token",
    ]);
  });

  it("detects high-entropy generic secret assignments and skips low-entropy or suppressed values", () => {
    const highEntropySecret = "Ab9xK2mPqR7vTzW4nY8cDfGh3jLmNpQrStUvWxYz12"; // trufflehog:ignore
    const lowEntropyPlaceholder = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const limitedClassPlaceholder =
      "example_placeholder_key_for_local_dev_only";
    const anthropicKey =
      "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD"; // trufflehog:ignore

    const content = [
      `const api_key = "${highEntropySecret}";`,
      `const secret_key = "${lowEntropyPlaceholder}";`,
      `const access_token = "${limitedClassPlaceholder}";`,
      `const client_secret = "${anthropicKey}";`,
      `const auth_token = "${highEntropySecret}"; // trufflehog:ignore`,
    ].join("\n");

    const findings = scanContentForSecrets(content, "config.ts");
    expect(findings).toHaveLength(2);
    expect(findings[0]?.rule).toBe("High-Entropy Secret Assignment");
    expect(findings[0]?.line).toBe(1);
    expect(findings[1]?.rule).toBe("Anthropic API Key");
    expect(findings[1]?.line).toBe(4);
  });

  it("distinguishes character class diversity and Shannon entropy threshold in high-entropy assignments", () => {
    // 2 character classes only (lowercase + digits) -> ignored
    const twoClasses = [
      'const access_token = "',
      "abcdefghijkmnpqrstuvwxyz23456789abcdefghij",
      '";',
    ].join("");
    expect(scanContentForSecrets(twoClasses, "config.ts")).toHaveLength(0);

    // 3 character classes (upper + lower + digits) but repeated pattern (< 4.2 entropy) -> ignored
    const lowEntropy = [
      'const api_key = "',
      "Ab0Ab0Ab0Ab0Ab0Ab0Ab0Ab0Ab0Ab0Ab0Ab0",
      '";',
    ].join("");
    expect(scanContentForSecrets(lowEntropy, "config.ts")).toHaveLength(0);

    // 4 character classes (upper + lower + symbols '_+=-') with >= 4.2 entropy -> detected
    const diverseHighEntropy = [
      'const secret_key = "',
      "AbCdEfGhIjKlMnOpQrStUvWx",
      "Yz_+=-aBcDeFgH",
      '";',
    ].join("");
    const findings = scanContentForSecrets(diverseHighEntropy, "config.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("High-Entropy Secret Assignment");
  });

  it("computes Shannon entropy accurately for empty, uniform, and diverse strings", () => {
    expect(computeShannonEntropy("")).toBe(0);
    expect(computeShannonEntropy("aaaaaaaaaa")).toBe(0);
    expect(computeShannonEntropy("ab")).toBe(1);
    expect(
      computeShannonEntropy("Ab9xK2mPqR7vTzW4nY8cDfGh3jLmNpQrStUvWxYz12"),
    ).toBeGreaterThanOrEqual(4.2);
  });
});

describe("parseStagedFilesOutput", () => {
  it("parses NUL-delimited file paths", () => {
    const raw = "file1.ts\0file 2.ts\0nested/dir/file3.ts\0";
    expect(parseStagedFilesOutput(raw)).toEqual([
      "file1.ts",
      "file 2.ts",
      "nested/dir/file3.ts",
    ]);
  });

  it("handles empty output", () => {
    expect(parseStagedFilesOutput("")).toEqual([]);
  });
});

function createMockExit() {
  let exitCodeCalled: number | null = null;
  const mockExit = (code: number): never => {
    exitCodeCalled = code;
    throw new Error(`Exit called with ${code}`);
  };
  return {
    mockExit,
    getExitCode: () => exitCodeCalled,
  };
}

describe("toRepoRelativePath", () => {
  it("normalizes absolute, relative, and dot-slash paths to repo-relative", () => {
    const repoRoot = "/mock/repo";
    expect(toRepoRelativePath("/mock/repo/src/index.ts", repoRoot)).toBe(
      "src/index.ts",
    );
    expect(toRepoRelativePath("src/index.ts", repoRoot)).not.toContain("//");
  });

  it("normalizes paths correctly when executed from a repository subdirectory", () => {
    const repoRoot = "/workspace/devtools";
    const subdir = "/workspace/devtools/apps/cli";
    expect(toRepoRelativePath("src/daemon.ts", repoRoot, subdir)).toBe(
      "apps/cli/src/daemon.ts",
    );
    expect(toRepoRelativePath("apps/cli/src/daemon.ts", repoRoot, subdir)).toBe(
      "apps/cli/src/daemon.ts",
    );
  });
});

describe("getStagedDeletedFiles", () => {
  it("returns a set of staged deleted file paths", () => {
    const mockSpawn = () => ({
      exitCode: 0,
      stdout: "deleted-file.ts\0old-module.ts\0",
    });
    const deleted = getStagedDeletedFiles(mockSpawn);
    expect(deleted.has("deleted-file.ts")).toBe(true);
    expect(deleted.has("old-module.ts")).toBe(true);
    expect(deleted.has("other.ts")).toBe(false);
  });
});

describe("getStagedFiles", () => {
  it("passes --diff-filter=d and -z to git diff and returns parsed files", () => {
    let capturedArgs: string[] = [];
    const mockSpawn = (args: string[]) => {
      capturedArgs = args;
      return {
        exitCode: 0,
        stdout: "apps/cli/index.ts\0packages/core/src/index.ts\0",
      };
    };

    const files = getStagedFiles(mockSpawn);
    expect(capturedArgs).toEqual([
      "git",
      "diff",
      "--name-only",
      "--cached",
      "--diff-filter=d",
      "-z",
    ]);
    expect(files).toEqual(["apps/cli/index.ts", "packages/core/src/index.ts"]);
  });

  it("excludes deleted files and handles staged deletions without errors", () => {
    const mockSpawn = (args: string[]) => {
      if (args.includes("--diff-filter=d")) {
        return { exitCode: 0, stdout: "active.ts\0" };
      }
      return { exitCode: 0, stdout: "deleted-file.ts\0" };
    };
    const stagedFiles = getStagedFiles(mockSpawn);
    const deletedFiles = getStagedDeletedFiles(mockSpawn);
    expect(stagedFiles).toEqual(["active.ts"]);
    expect(deletedFiles).toEqual(new Set(["deleted-file.ts"]));
  });

  it("fails closed when git diff exits with non-zero code", () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const mockSpawn = () => ({
      exitCode: 1,
      stdout: "",
      stderr: "fatal: not a git repo",
    });
    const { mockExit, getExitCode } = createMockExit();

    try {
      expect(() => getStagedFiles(mockSpawn, mockExit)).toThrow(
        "Exit called with 1",
      );
      expect(getExitCode()).toBe(1);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("fails closed when git diff throws an error", () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const mockSpawn = () => {
      throw new Error("spawn failed");
    };
    const { mockExit, getExitCode } = createMockExit();

    try {
      expect(() => getStagedFiles(mockSpawn, mockExit)).toThrow(
        "Exit called with 1",
      );
      expect(getExitCode()).toBe(1);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

describe("readStagedContent", () => {
  it("reads staged content using git show :<path>", () => {
    const mockSpawn = (args: string[]) => {
      expect(args).toEqual(["git", "show", ":src/index.ts"]);
      return {
        exitCode: 0,
        stdout: "export const x = 1;\n",
      };
    };

    const content = readStagedContent("src/index.ts", "/mock/repo", mockSpawn);
    expect(content).toBe("export const x = 1;\n");
  });

  it("skips binary extensions without invoking git show", () => {
    let spawnCalled = false;
    const mockSpawn = () => {
      spawnCalled = true;
      return { exitCode: 0, stdout: "" };
    };

    const content = readStagedContent("image.png", "/mock/repo", mockSpawn);
    expect(content).toBeNull();
    expect(spawnCalled).toBe(false);
  });

  it("fails closed when git show fails for non-deleted staged file", () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const mockSpawn = () => ({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: path 'missing.ts' does not exist in :",
    });
    const { mockExit, getExitCode } = createMockExit();

    try {
      expect(() =>
        readStagedContent("missing.ts", "/mock/repo", mockSpawn, mockExit),
      ).toThrow("Exit called with 1");
      expect(getExitCode()).toBe(1);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

describe("resolvePushRange", () => {
  it("uses explicit base ref when provided and has commits", () => {
    const mockSpawn = (args: string[]) => {
      if (args[0] === "git" && args[1] === "rev-list") {
        expect(args).toEqual(["git", "rev-list", "--count", "main..HEAD"]);
        return { exitCode: 0, stdout: "3\n" };
      }
      return { exitCode: 1, stdout: "" };
    };

    expect(resolvePushRange("main", mockSpawn)).toEqual({
      base: "main",
      head: "HEAD",
      range: "main..HEAD",
    });
  });

  it("prefers @{u} upstream when no explicit base is provided", () => {
    const mockSpawn = (args: string[]) => {
      if (args[1] === "rev-parse" && args[2] === "--abbrev-ref") {
        return { exitCode: 0, stdout: "origin/feat-x\n" };
      }
      if (args[1] === "rev-list") {
        expect(args).toEqual([
          "git",
          "rev-list",
          "--count",
          "origin/feat-x..HEAD",
        ]);
        return { exitCode: 0, stdout: "2\n" };
      }
      return { exitCode: 1, stdout: "" };
    };

    expect(resolvePushRange(undefined, mockSpawn)).toEqual({
      base: "origin/feat-x",
      head: "HEAD",
      range: "origin/feat-x..HEAD",
    });
  });

  it("falls back to origin/main when no upstream exists and returns null when count is 0", () => {
    const mockSpawn = (args: string[]) => {
      if (args[1] === "rev-parse") {
        return { exitCode: 128, stdout: "" };
      }
      if (args[1] === "rev-list") {
        expect(args).toEqual([
          "git",
          "rev-list",
          "--count",
          "origin/main..HEAD",
        ]);
        return { exitCode: 0, stdout: "0\n" };
      }
      return { exitCode: 1, stdout: "" };
    };

    expect(resolvePushRange(undefined, mockSpawn)).toBeNull();
  });

  it("throws when git rev-list --count fails", () => {
    expect(() =>
      resolvePushRange("missing/ref", () => ({
        exitCode: 128,
        stdout: "",
        stderr: "fatal: bad revision 'missing/ref..HEAD'",
      })),
    ).toThrow('Failed to inspect git commit range "missing/ref..HEAD"');
  });
});

describe("readPrePushStdin and parsePrePushRefs", () => {
  it("returns empty string for TTY stdin and reads non-TTY stdin", () => {
    expect(readPrePushStdin(true, () => "should-not-read")).toBe("");
    expect(
      readPrePushStdin(
        false,
        () => "refs/heads/feat abc123 refs/heads/feat def456\n",
      ),
    ).toBe("refs/heads/feat abc123 refs/heads/feat def456\n");
  });

  it("parses valid pre-push ref lines and ignores blank or malformed lines", () => {
    const parsed = parsePrePushRefs(
      [
        "",
        "invalid-line",
        "refs/heads/other 111111 refs/heads/other 222222",
        `refs/heads/new 333333 refs/heads/new ${"0".repeat(40)}`,
      ].join("\n"),
    );
    expect(parsed).toEqual([
      {
        localRef: "refs/heads/other",
        localOid: "111111",
        remoteRef: "refs/heads/other",
        remoteOid: "222222",
      },
      {
        localRef: "refs/heads/new",
        localOid: "333333",
        remoteRef: "refs/heads/new",
        remoteOid: "0".repeat(40),
      },
    ]);
  });

  it("resolves pushed branch ranges from stdin, handles new branches, skips deletions, and falls back when stdin is empty", () => {
    const stdinText = [
      "refs/heads/other local111 refs/heads/other remote000",
      `refs/heads/new-branch local222 refs/heads/new-branch ${"0".repeat(40)}`,
      `refs/heads/deleted ${"0".repeat(40)} refs/heads/deleted remote333`,
    ].join("\n");

    const ranges = resolvePushRanges(
      undefined,
      (args) => {
        if (args[1] === "rev-list" && args[3] === "remote000..local111") {
          return { exitCode: 0, stdout: "2\n" };
        }
        if (args[1] === "rev-list" && args[3] === "origin/main..local222") {
          return { exitCode: 0, stdout: "1\n" };
        }
        return { exitCode: 1, stdout: "" };
      },
      stdinText,
    );

    expect(ranges).toEqual([
      {
        base: "remote000",
        head: "local111",
        range: "remote000..local111",
      },
      {
        base: "origin/main",
        head: "local222",
        range: "origin/main..local222",
      },
    ]);

    const fallback = resolvePushRanges(
      "origin/main",
      () => ({ exitCode: 0, stdout: "1\n" }),
      "",
    );
    expect(fallback).toEqual([
      {
        base: "origin/main",
        head: "HEAD",
        range: "origin/main..HEAD",
      },
    ]);
  });
});

describe("scanCommitRangeWithTrufflehog", () => {
  it("invokes trufflehog with CI-parity flags and exclude list", () => {
    const mockSpawn = (args: string[]) => {
      expect(args).toEqual([
        "trufflehog",
        "git",
        "file://.",
        "--since-commit",
        "origin/main",
        "--branch",
        "HEAD",
        "--fail",
        "--no-update",
        "--results=verified,unknown",
        "--exclude-paths=.github/trufflehog-exclude.txt",
      ]);
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    expect(scanCommitRangeWithTrufflehog("origin/main", mockSpawn)).toBe(0);
  });
});

describe("scanCommitRangeFallback", () => {
  it("detects secrets added in commit patches and commit messages while ignoring binary/suppressed lines", () => {
    const fakeAws = "AKIAIOSFODNN7EXAMPLE"; // trufflehog:ignore
    const fakeGhp = "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // trufflehog:ignore
    const mockSpawn = (args: string[]) => {
      if (args.includes("-p")) {
        return {
          exitCode: 0,
          stdout: [
            "diff --git a/src/env.ts b/src/env.ts",
            "+++ b/src/env.ts",
            "@@ -1,0 +1,2 @@",
            `+const key = "${fakeAws}";`,
            `+const ignored = "${fakeAws}"; // trufflehog:ignore`,
            "diff --git a/logo.png b/logo.png",
            "+++ b/logo.png",
            `+${fakeGhp}`,
          ].join("\n"),
        };
      }
      return {
        exitCode: 0,
        stdout: `commit abc123\nchore: add token ${fakeGhp}\n`,
      };
    };

    const findings = scanCommitRangeFallback("origin/main..HEAD", mockSpawn);
    expect(findings).toHaveLength(2);
    expect(findings[0]?.file).toBe("src/env.ts");
    expect(findings[0]?.rule).toBe("AWS Access Key ID");
    expect(findings[1]?.file).toBe("commit-message");
    expect(findings[1]?.rule).toBe("GitHub Personal Access Token");
  });

  it("passes -m to git log and deduplicates repeated findings across merge parents", () => {
    const fakeAws = "AKIAIOSFODNN7EXAMPLE"; // trufflehog:ignore
    let patchArgs: string[] = [];
    const findings = scanCommitRangeFallback("origin/main..HEAD", (args) => {
      if (args.includes("-p")) {
        patchArgs = args;
        return {
          exitCode: 0,
          stdout: [
            "diff --git a/src/conflict.ts b/src/conflict.ts",
            "+++ b/src/conflict.ts",
            `+const a = "${fakeAws}";`,
            "diff --git a/src/conflict.ts b/src/conflict.ts",
            "+++ b/src/conflict.ts",
            `+const a = "${fakeAws}";`,
          ].join("\n"),
        };
      }
      return { exitCode: 0, stdout: "" };
    });

    expect(patchArgs).toContain("-m");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toBe("src/conflict.ts");
  });

  it("detects a secret introduced during real git merge conflict resolution", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "devtools-merge-secret-"));
    const runGit = (args: string[]) => {
      const proc = Bun.spawnSync(["git", ...args], { cwd: repoDir });
      if (proc.exitCode !== 0) {
        throw new Error(
          `git ${args.join(" ")} failed: ${proc.stderr.toString()}`,
        );
      }
      return proc.stdout.toString().trim();
    };

    try {
      runGit(["init", "-b", "main"]);
      runGit(["config", "user.email", "test@example.com"]);
      runGit(["config", "user.name", "Test User"]);

      writeFileSync(
        join(repoDir, "config.ts"),
        'export const mode = "base";\n',
      );
      runGit(["add", "config.ts"]);
      runGit(["commit", "-m", "chore: base"]);
      const baseOid = runGit(["rev-parse", "HEAD"]);

      runGit(["checkout", "-b", "feature"]);
      writeFileSync(
        join(repoDir, "config.ts"),
        'export const mode = "feature";\n',
      );
      runGit(["commit", "-am", "feat: feature mode"]);

      runGit(["checkout", "main"]);
      writeFileSync(
        join(repoDir, "config.ts"),
        'export const mode = "main";\n',
      );
      runGit(["commit", "-am", "chore: main mode"]);

      const mergeAttempt = Bun.spawnSync(
        ["git", "merge", "feature", "--no-commit"],
        { cwd: repoDir },
      );
      expect(mergeAttempt.exitCode).not.toBe(0);

      const syntheticAws = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
      writeFileSync(
        join(repoDir, "config.ts"),
        `export const mode = "resolved";\nexport const key = "${syntheticAws}";\n`,
      );
      runGit(["add", "config.ts"]);
      runGit(["commit", "-m", "merge feature with conflict resolution"]);

      const findings = scanCommitRangeFallback(`${baseOid}..HEAD`, (args) =>
        Bun.spawnSync(args, { cwd: repoDir }),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]?.file).toBe("config.ts");
      expect(findings[0]?.rule).toBe("AWS Access Key ID");
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("throws when git log patch or message commands fail", () => {
    expect(() =>
      scanCommitRangeFallback("origin/main..HEAD", (args) =>
        args.includes("-p")
          ? { exitCode: 128, stdout: "", stderr: "bad range" }
          : { exitCode: 0, stdout: "" },
      ),
    ).toThrow('Failed to read git patch history for "origin/main..HEAD"');

    expect(() =>
      scanCommitRangeFallback("origin/main..HEAD", (args) =>
        args.includes("-p")
          ? { exitCode: 0, stdout: "" }
          : { exitCode: 128, stdout: "", stderr: "bad log" },
      ),
    ).toThrow('Failed to read git commit messages for "origin/main..HEAD"');
  });
});

describe("runRangeScan", () => {
  it("uses trufflehog when available on PATH and fails closed when secrets are found", () => {
    const calls: string[][] = [];
    const mockSpawn = (args: string[]) => {
      calls.push(args);
      if (args[0] === "which" && args[1] === "trufflehog") {
        return { exitCode: 0, stdout: "/usr/local/bin/trufflehog\n" };
      }
      if (args[0] === "git" && args[1] === "rev-list") {
        return { exitCode: 0, stdout: "1\n" };
      }
      if (args[0] === "trufflehog") {
        return { exitCode: 183, stdout: "", stderr: "secret found" };
      }
      return { exitCode: 0, stdout: "" };
    };

    const result = runRangeScan("origin/main", mockSpawn);
    expect(result.engine).toBe("trufflehog");
    expect(result.passed).toBe(false);
    expect(calls.some((c) => c[0] === "trufflehog")).toBe(true);
  });

  it("scans non-HEAD pushed branch from pre-push stdin with trufflehog and built-in fallback", () => {
    const stdinLine = "refs/heads/other local123 refs/heads/other remote000\n";
    const trufflehogCalls: string[][] = [];
    const trufflehogRes = runRangeScan(
      undefined,
      (args) => {
        if (args[0] === "which" && args[1] === "trufflehog") {
          return { exitCode: 0, stdout: "/usr/local/bin/trufflehog\n" };
        }
        if (args[0] === "git" && args[1] === "rev-list") {
          return { exitCode: 0, stdout: "1\n" };
        }
        if (args[0] === "trufflehog") {
          trufflehogCalls.push(args);
          return { exitCode: 0, stdout: "" };
        }
        return { exitCode: 0, stdout: "" };
      },
      stdinLine,
    );
    expect(trufflehogRes).toEqual({
      engine: "trufflehog",
      passed: true,
      findings: [],
    });
    expect(trufflehogCalls[0]).toContain("remote000");
    expect(trufflehogCalls[0]).toContain("local123");

    const fakeAws = "AKIAIOSFODNN7EXAMPLE"; // trufflehog:ignore
    const builtinRes = runRangeScan(
      undefined,
      (args) => {
        if (args[0] === "which") {
          return { exitCode: 1, stdout: "" };
        }
        if (args[0] === "git" && args[1] === "rev-list") {
          return { exitCode: 0, stdout: "1\n" };
        }
        if (args[0] === "git" && args.includes("-p")) {
          return {
            exitCode: 0,
            stdout: `+++ b/other.ts\n+const k = "${fakeAws}";\n`,
          };
        }
        return { exitCode: 0, stdout: "" };
      },
      stdinLine,
    );
    expect(builtinRes.engine).toBe("builtin");
    expect(builtinRes.passed).toBe(false);
    expect(builtinRes.findings).toHaveLength(1);
  });

  it("falls back to built-in Bun range scanner when trufflehog is not installed", () => {
    const mockSpawn = (args: string[]) => {
      if (args[0] === "which" && args[1] === "trufflehog") {
        return { exitCode: 1, stdout: "" };
      }
      if (args[0] === "git" && args[1] === "rev-list") {
        return { exitCode: 0, stdout: "1\n" };
      }
      if (args[0] === "git" && args[1] === "log") {
        return { exitCode: 0, stdout: "" };
      }
      return { exitCode: 0, stdout: "" };
    };

    const result = runRangeScan("origin/main", mockSpawn);
    expect(result.engine).toBe("builtin");
    expect(result.passed).toBe(true);
  });

  it("fails closed when rev-list fails and skips when zero unpushed commits exist", () => {
    const failed = runRangeScan("origin/main", () => ({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: bad revision",
    }));
    expect(failed.engine).toBe("builtin");
    expect(failed.passed).toBe(false);
    expect(failed.error).toContain("Failed to inspect git commit range");

    const skipped = runRangeScan("origin/main", (args) =>
      args[1] === "rev-list"
        ? { exitCode: 0, stdout: "0\n" }
        : { exitCode: 0, stdout: "" },
    );
    expect(skipped).toEqual({ engine: "skipped", passed: true, findings: [] });
  });

  it("handles deleted file markers in commit patches", () => {
    const findings = scanCommitRangeFallback("origin/main..HEAD", (args) =>
      args.includes("-p")
        ? {
            exitCode: 0,
            stdout: "+++ /dev/null\n+sk-proj-ignored\n",
          }
        : { exitCode: 0, stdout: "" },
    );
    expect(findings).toHaveLength(0);
  });
});

describe("run CLI", () => {
  it("handles --range skipped, passed, and failed outcomes", () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    const { mockExit } = createMockExit();
    try {
      run(["--range"], {
        readPrePushStdin: () => "",
        runRangeScan: () => ({ engine: "skipped", passed: true, findings: [] }),
      });
      run(["--range", "origin/main"], {
        readPrePushStdin: () => "",
        runRangeScan: () => ({ engine: "builtin", passed: true, findings: [] }),
      });
      expect(() =>
        run(["--range"], {
          readPrePushStdin: () => "",
          runRangeScan: () => ({
            engine: "trufflehog",
            passed: false,
            findings: [],
          }),
          exitFn: mockExit,
        }),
      ).toThrow("Exit called with 1");
      expect(() =>
        run(["--range"], {
          readPrePushStdin: () => "",
          runRangeScan: () => ({
            engine: "builtin",
            passed: false,
            findings: [],
            error: "Failed to inspect git commit range",
          }),
          exitFn: mockExit,
        }),
      ).toThrow("Exit called with 1");
      expect(() =>
        run(["--range"], {
          readPrePushStdin: () => "",
          runRangeScan: () => ({
            engine: "builtin",
            passed: false,
            findings: [
              { file: "a.ts", line: 1, rule: "Test", token: "secret12345" },
            ],
          }),
          exitFn: mockExit,
        }),
      ).toThrow("Exit called with 1");
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("handles staged files empty, clean, and secret-detected outcomes", () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    const { mockExit } = createMockExit();
    try {
      run([], {
        getStagedDeletedFiles: () => new Set(),
        getStagedFiles: () => [],
      });
      run(["a.png", "b.ts"], {
        getStagedDeletedFiles: () => new Set(),
        readStagedContent: (f) => (f.endsWith(".png") ? null : "const x = 1;"),
      });
      const fakeAws = "AKIAIOSFODNN7EXAMPLE"; // trufflehog:ignore
      expect(() =>
        run(["bad.ts"], {
          getStagedDeletedFiles: () => new Set(),
          readStagedContent: () => `const k = "${fakeAws}";`,
          exitFn: mockExit,
        }),
      ).toThrow("Exit called with 1");
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
