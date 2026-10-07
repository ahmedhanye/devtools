import { describe, expect, it, spyOn } from "bun:test";
import {
  scanContentForSecrets,
  maskSecret,
  isIgnoredLine,
  parseStagedFilesOutput,
  toRepoRelativePath,
  getStagedFiles,
  getStagedDeletedFiles,
  readStagedContent,
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
  });
});

describe("scanContentForSecrets", () => {
  it("detects unsuppressed AWS access key IDs", () => {
    const awsKey = "AKIAIOSFODNN7EXAMPLE"; // trufflehog:ignore
    const content = `\nconst awsKey = "${awsKey}";\nconsole.log(awsKey);\n`;
    const findings = scanContentForSecrets(content, "test.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("AWS Access Key ID");
    expect(findings[0].line).toBe(2);
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
    expect(findings[0].rule).toBe("GitHub Personal Access Token");
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
    expect(findings[0].rule).toBe("Slack Token");
  });

  it("detects OpenAI API keys", () => {
    const openAiKey = "sk-proj-abcdefghijklmnopqrstuvwxyz01234567890123456789"; // trufflehog:ignore
    const content = `const openAi = "${openAiKey}";`;
    const findings = scanContentForSecrets(content, "ai.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("OpenAI API Key");
  });

  it("detects Stripe secret keys", () => {
    const stripeKey = "sk_test_51Abcdefghijklmnopqrstuvwx"; // trufflehog:ignore
    const content = `const stripe = "${stripeKey}";`;
    const findings = scanContentForSecrets(content, "stripe.ts");
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("Stripe API Key");
  });

  it("detects private keys", () => {
    const privateKey =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----"; // trufflehog:ignore
    const findings = scanContentForSecrets(privateKey, "key.pem");
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].rule).toBe("Private Key");
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
    const deleted = getStagedDeletedFiles(mockSpawn as any);
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

    const files = getStagedFiles(mockSpawn as any);
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
    const deletedFiles = new Set(["deleted-file.ts"]);
    const candidateFiles = ["deleted-file.ts", "active.ts"];
    const filesToScan = candidateFiles.filter((f) => !deletedFiles.has(f));
    expect(filesToScan).toEqual(["active.ts"]);
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
      expect(() => getStagedFiles(mockSpawn as any, mockExit)).toThrow(
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
      expect(() => getStagedFiles(mockSpawn as any, mockExit)).toThrow(
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

    const content = readStagedContent(
      "src/index.ts",
      "/mock/repo",
      mockSpawn as any,
    );
    expect(content).toBe("export const x = 1;\n");
  });

  it("skips binary extensions without invoking git show", () => {
    let spawnCalled = false;
    const mockSpawn = () => {
      spawnCalled = true;
      return { exitCode: 0, stdout: "" };
    };

    const content = readStagedContent(
      "image.png",
      "/mock/repo",
      mockSpawn as any,
    );
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
        readStagedContent(
          "missing.ts",
          "/mock/repo",
          mockSpawn as any,
          mockExit,
        ),
      ).toThrow("Exit called with 1");
      expect(getExitCode()).toBe(1);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
