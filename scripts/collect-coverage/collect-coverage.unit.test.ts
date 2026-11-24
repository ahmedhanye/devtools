import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import {
  collectCoverage,
  formatCoverageFailureMessage,
  mergeLcovContents,
  normalizeCoverageTarget,
  normalizeLcovPaths,
  parseCollectCoverageCliArgs,
  resolveTargetsForFiles,
} from "./collect-coverage";

describe("collect-coverage", () => {
  const repoRoot = path.resolve("test-fixtures/mock-repo");

  describe("normalizeLcovPaths", () => {
    it("normalizes relative SF paths within a workspace directory", () => {
      const input = `
TN:
SF:src/components/button.tsx
DA:1,1
end_of_record
`.trim();

      const normalized = normalizeLcovPaths(
        input,
        path.join(repoRoot, "apps/frontend"),
        repoRoot,
      );

      expect(normalized).toContain(
        "SF:apps/frontend/src/components/button.tsx",
      );
      expect(normalized).not.toContain("SF:src/components/button.tsx");
    });

    it("normalizes absolute SF paths to repo-relative paths", () => {
      const absFilePath = path.join(repoRoot, "packages/core/src/index.ts");
      const input = `
TN:
SF:${absFilePath}
DA:5,3
end_of_record
`.trim();

      const normalized = normalizeLcovPaths(
        input,
        path.join(repoRoot, "packages/core"),
        repoRoot,
      );

      expect(normalized).toContain("SF:packages/core/src/index.ts");
      expect(normalized).not.toContain(repoRoot);
    });

    it("preserves already repo-relative paths", () => {
      const input = `
TN:
SF:scripts/verify-commit-msg.ts
DA:2,1
end_of_record
`.trim();

      const normalized = normalizeLcovPaths(input, repoRoot, repoRoot);

      expect(normalized).toContain("SF:scripts/verify-commit-msg.ts");
    });

    it("supports passing an LcovEntry object directly", () => {
      const entry = {
        baseDir: path.join(repoRoot, "packages/db"),
        content: `SF:src/client.ts\nDA:10,2\nend_of_record`,
      };

      const normalized = normalizeLcovPaths(entry, repoRoot);
      expect(normalized).toContain("SF:packages/db/src/client.ts");
    });

    it("is idempotent when applied repeatedly", () => {
      const input = `SF:src/components/button.tsx\nDA:1,1\nend_of_record`;
      const workspaceDir = path.join(repoRoot, "apps/frontend");
      const first = normalizeLcovPaths(input, workspaceDir, repoRoot);
      const second = normalizeLcovPaths(first, repoRoot, repoRoot);
      expect(second).toBe(first);
    });
  });

  describe("mergeLcovContents", () => {
    it("combines multiple workspace LCOV contents into a unified string", () => {
      const pkg1 = {
        baseDir: path.join(repoRoot, "packages/core"),
        content: `SF:src/index.ts\nDA:1,1\nend_of_record`,
      };
      const pkg2 = {
        baseDir: path.join(repoRoot, "apps/frontend"),
        content: `SF:src/app.tsx\nDA:2,4\nend_of_record`,
      };

      const merged = mergeLcovContents([pkg1, pkg2], repoRoot);

      expect(merged).toContain("SF:packages/core/src/index.ts");
      expect(merged).toContain("SF:apps/frontend/src/app.tsx");
      expect(merged.endsWith("\n")).toBe(true);
    });

    it("handles empty array or empty content gracefully", () => {
      const merged = mergeLcovContents([], repoRoot);
      expect(merged).toBe("");
    });
  });

  describe("collectCoverage", () => {
    function createMockCoverageSpawner(options?: {
      failForPath?: string;
      emptyForPath?: string;
      commandStatus?: number;
    }) {
      return (
        cmd: string,
        args: string[],
        opts: { cwd: string; stdio?: string },
      ) => {
        if (cmd === "bunx" && args.includes("fumadocs-mdx")) {
          return { status: options?.commandStatus ?? 0 };
        }
        if (cmd === "bun" && args.includes("--coverage")) {
          let targetDir: string;
          if (args.includes("@devtools/frontend")) {
            targetDir = path.join(opts.cwd, "apps/frontend/coverage");
          } else {
            const covDirArg = args.find((a) => a.startsWith("--coverage-dir="));
            const covDir = covDirArg ? covDirArg.split("=")[1] : "coverage";
            targetDir = path.resolve(opts.cwd, covDir);
          }
          const targetFile = path.join(targetDir, "lcov.info");

          if (
            options?.failForPath &&
            targetFile.includes(options.failForPath)
          ) {
            return { status: 0 };
          }

          fs.mkdirSync(targetDir, { recursive: true });
          if (
            options?.emptyForPath &&
            targetFile.includes(options.emptyForPath)
          ) {
            fs.writeFileSync(targetFile, "");
          } else {
            fs.writeFileSync(
              targetFile,
              `SF:${opts.cwd}/sample.ts\nDA:1,1\nend_of_record\n`,
            );
          }
          return { status: 0 };
        }
        return { status: 0 };
      };
    }

    it("invokes bunx fumadocs-mdx in site directory before running tests for site", async () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "collect-cov-site-"),
      );
      try {
        fs.mkdirSync(path.join(tmpDir, "site"), { recursive: true });
        const commands: Array<{ cmd: string; args: string[]; cwd: string }> =
          [];

        const defaultSpawner = createMockCoverageSpawner();

        await collectCoverage({
          repoRoot: tmpDir,
          outputDir: path.join(tmpDir, "coverage"),
          spawnCommand: (cmd, args, opts) => {
            commands.push({ cmd, args, cwd: opts.cwd });
            return defaultSpawner(cmd, args, opts);
          },
        });

        const mdxCallIndex = commands.findIndex(
          (c) =>
            c.cmd === "bunx" &&
            c.args.includes("fumadocs-mdx") &&
            c.cwd.endsWith("site"),
        );
        const siteTestIndex = commands.findIndex(
          (c) =>
            c.cmd === "bun" &&
            c.args.includes("test") &&
            c.cwd.endsWith("site"),
        );

        expect(mdxCallIndex).toBeGreaterThanOrEqual(0);
        expect(siteTestIndex).toBeGreaterThan(mdxCallIndex);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("throws an error if fumadocs-mdx fails in site", async () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "collect-cov-fail-"),
      );
      try {
        fs.mkdirSync(path.join(tmpDir, "site"), { recursive: true });
        await expect(
          collectCoverage({
            repoRoot: tmpDir,
            outputDir: path.join(tmpDir, "coverage"),
            spawnCommand: (cmd, args, _opts) => {
              if (cmd === "bunx" && args.includes("fumadocs-mdx")) {
                return { status: 1 };
              }
              return { status: 0 };
            },
          }),
        ).rejects.toThrow("fumadocs-mdx failed in");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("preserves merged output directory when cleanPriorReports is true and outputDir is cleaned", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-clean-test-"));
      const outputDir = path.join(tmpDir, "coverage/scripts");
      try {
        fs.mkdirSync(path.join(tmpDir, "packages/core"), { recursive: true });
        const result = await collectCoverage({
          repoRoot: tmpDir,
          outputDir,
          cleanPriorReports: true,
          spawnCommand: createMockCoverageSpawner(),
        });
        expect(fs.existsSync(result.outputPath)).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("throws an error when a workspace lcov.info is missing", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-missing-pkg-"));
      try {
        fs.mkdirSync(path.join(tmpDir, "site"), { recursive: true });
        await expect(
          collectCoverage({
            repoRoot: tmpDir,
            outputDir: path.join(tmpDir, "coverage"),
            spawnCommand: createMockCoverageSpawner({
              failForPath: "site/coverage/lcov.info",
            }),
          }),
        ).rejects.toThrow("Coverage collection failed: expected");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("throws an error when a workspace lcov.info is empty (0 bytes)", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-empty-pkg-"));
      try {
        fs.mkdirSync(path.join(tmpDir, "site"), { recursive: true });
        await expect(
          collectCoverage({
            repoRoot: tmpDir,
            outputDir: path.join(tmpDir, "coverage"),
            spawnCommand: createMockCoverageSpawner({
              emptyForPath: "site/coverage/lcov.info",
            }),
          }),
        ).rejects.toThrow("was not written or is empty");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("throws an error when scripts coverage report is missing or empty", async () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "cov-scripts-miss-"),
      );
      try {
        await expect(
          collectCoverage({
            repoRoot: tmpDir,
            outputDir: path.join(tmpDir, "coverage"),
            spawnCommand: createMockCoverageSpawner({
              failForPath: "coverage/scripts/lcov.info",
            }),
          }),
        ).rejects.toThrow("Coverage collection failed: expected");

        await expect(
          collectCoverage({
            repoRoot: tmpDir,
            outputDir: path.join(tmpDir, "coverage"),
            spawnCommand: createMockCoverageSpawner({
              emptyForPath: "coverage/scripts/lcov.info",
            }),
          }),
        ).rejects.toThrow("was not written or is empty");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("throws an error when apps/frontend coverage report is missing or empty", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-front-miss-"));
      try {
        fs.mkdirSync(path.join(tmpDir, "apps/frontend"), { recursive: true });
        await expect(
          collectCoverage({
            repoRoot: tmpDir,
            outputDir: path.join(tmpDir, "coverage"),
            spawnCommand: createMockCoverageSpawner({
              failForPath: "apps/frontend/coverage/lcov.info",
            }),
          }),
        ).rejects.toThrow("Coverage collection failed: expected");

        await expect(
          collectCoverage({
            repoRoot: tmpDir,
            outputDir: path.join(tmpDir, "coverage"),
            spawnCommand: createMockCoverageSpawner({
              emptyForPath: "apps/frontend/coverage/lcov.info",
            }),
          }),
        ).rejects.toThrow("was not written or is empty");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("runs only requested workspaces when scoped and preserves sibling LCOV reports on merge", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-scoped-"));
      try {
        fs.mkdirSync(path.join(tmpDir, "packages/core"), { recursive: true });
        fs.mkdirSync(path.join(tmpDir, "packages/db/coverage"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(tmpDir, "packages/db/coverage/lcov.info"),
          `SF:src/db.ts\nDA:1,1\nend_of_record\n`,
        );

        const ranCwds: string[] = [];
        const defaultSpawner = createMockCoverageSpawner();
        const result = await collectCoverage({
          repoRoot: tmpDir,
          outputDir: path.join(tmpDir, "coverage"),
          cleanPriorReports: true,
          workspaces: ["packages/core"],
          spawnCommand: (cmd, args, opts) => {
            ranCwds.push(opts.cwd);
            return defaultSpawner(cmd, args, opts);
          },
        });

        expect(ranCwds).toEqual([path.join(tmpDir, "packages/core")]);
        expect(result.mergedCount).toBe(2);
        const merged = fs.readFileSync(result.outputPath, "utf8");
        expect(merged).toContain("SF:packages/core/sample.ts");
        expect(merged).toContain("SF:packages/db/src/db.ts");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("workspace targeting helpers", () => {
    it("normalizes paths, trailing slashes, and workspace package aliases", () => {
      expect(normalizeCoverageTarget("./packages/lighthouse/")).toBe(
        "packages/lighthouse",
      );
      expect(normalizeCoverageTarget("@devtools/cli")).toBe("apps/cli");
      expect(normalizeCoverageTarget("scripts/")).toBe("scripts");
      expect(() => normalizeCoverageTarget("packages/unknown")).toThrow(
        'Unknown coverage target "packages/unknown"',
      );
    });

    it("maps modified file paths to unique coverage targets and skips docs", () => {
      expect(
        resolveTargetsForFiles([
          "REVIEW.md",
          "docs/testing/box-testing.md",
          "packages/lighthouse/src/index.ts",
          "packages/lighthouse/tests/audit.unit.test.ts",
          "scripts/verify-staged-secrets/verify-staged-secrets.ts",
          "apps/frontend/src/App.tsx",
        ]),
      ).toEqual(["packages/lighthouse", "scripts", "apps/frontend"]);
    });

    it("parses positional targets, --scope, --changed, --base, and --help", () => {
      expect(parseCollectCoverageCliArgs(["--help"])).toEqual({
        help: true,
        emptyChangedSelection: false,
      });

      expect(
        parseCollectCoverageCliArgs([
          "packages/core",
          "--scope",
          "@devtools/db",
        ]),
      ).toEqual({
        help: false,
        workspaces: ["packages/core", "packages/db"],
        emptyChangedSelection: false,
      });

      const gitCalls: string[][] = [];
      const changed = parseCollectCoverageCliArgs(["--changed"], {
        repoRoot: "/tmp/repo",
        env: { BASE_REF: "origin/stack-parent" },
        gitRunner: (args) => {
          gitCalls.push(args);
          if (args.includes("origin/stack-parent...HEAD")) {
            return { status: 0, stdout: "apps/api/src/routes.ts\n" };
          }
          return { status: 0, stdout: "" };
        },
      });
      expect(changed).toEqual({
        help: false,
        workspaces: ["apps/api"],
        emptyChangedSelection: false,
      });
      expect(gitCalls[0]).toEqual([
        "diff",
        "--name-only",
        "origin/stack-parent...HEAD",
      ]);

      const workingTreeSelection = parseCollectCoverageCliArgs(
        ["--changed", "--base", "origin/main"],
        {
          repoRoot: "/tmp/repo",
          gitRunner: (args) => {
            if (args[0] === "diff" && args.length === 2) {
              return { status: 0, stdout: "packages/db/src/client.ts\n" };
            }
            if (args[0] === "ls-files") {
              return { status: 0, stdout: "apps/cli/src/new-file.ts\n" };
            }
            return { status: 0, stdout: "" };
          },
        },
      );
      expect(workingTreeSelection).toEqual({
        help: false,
        workspaces: ["packages/db", "apps/cli"],
        emptyChangedSelection: false,
      });

      const docsOnly = parseCollectCoverageCliArgs(
        ["--changed", "--base", "origin/main"],
        {
          repoRoot: "/tmp/repo",
          gitRunner: () => ({ status: 0, stdout: "REVIEW.md\nTESTING.md\n" }),
        },
      );
      expect(docsOnly).toEqual({
        help: false,
        workspaces: [],
        emptyChangedSelection: true,
      });

      expect(() => parseCollectCoverageCliArgs(["--bogus"])).toThrow(
        'Unknown option "--bogus"',
      );
      expect(() => parseCollectCoverageCliArgs(["--scope"])).toThrow(
        'Option "--scope" requires a workspace target argument.',
      );
      expect(() => parseCollectCoverageCliArgs(["--base"])).toThrow(
        'Option "--base" requires a git ref argument.',
      );
    });

    it("fails closed with actionable error when --changed base diff or working-tree git inspection fails", () => {
      expect(() =>
        parseCollectCoverageCliArgs(["--changed", "--base", "origin/missing"], {
          repoRoot: "/tmp/repo",
          gitRunner: (args) => {
            if (args.includes("origin/missing...HEAD")) {
              return {
                status: 128,
                stdout: "",
                stderr:
                  "fatal: ambiguous argument 'origin/missing...HEAD': unknown revision",
              };
            }
            return { status: 0, stdout: "" };
          },
        }),
      ).toThrow(
        /Could not diff against "origin\/missing\.\.\.HEAD"[\s\S]*git fetch origin missing[\s\S]*--base <ref>[\s\S]*unknown revision/,
      );

      expect(() =>
        parseCollectCoverageCliArgs(["--changed", "--base", "origin/main"], {
          repoRoot: "/tmp/repo",
          gitRunner: () => ({ status: 128, stdout: "" }),
        }),
      ).toThrow(/Could not diff against "origin\/main\.\.\.HEAD"[\s\S]*128/);

      expect(() =>
        parseCollectCoverageCliArgs(["--changed", "--base", "origin/main"], {
          repoRoot: "/tmp/repo",
          gitRunner: (args) => {
            if (args[0] === "diff" && args[1] === "--cached") {
              return {
                status: 128,
                stdout: "",
                stderr: "fatal: not a git repository",
              };
            }
            return { status: 0, stdout: "" };
          },
        }),
      ).toThrow(/git diff --cached --name-only[\s\S]*not a git repository/);

      expect(() =>
        parseCollectCoverageCliArgs(["--changed", "--base", "origin/main"], {
          repoRoot: "/tmp/repo",
          gitRunner: () => ({
            status: 1,
            stdout: "fatal: stdout-only diagnostic",
            stderr: "   ",
          }),
        }),
      ).toThrow(
        /Could not diff against "origin\/main\.\.\.HEAD"[\s\S]*fatal: stdout-only diagnostic/,
      );

      expect(() =>
        parseCollectCoverageCliArgs(["--changed", "--base", "origin/main"], {
          repoRoot: "/tmp/repo",
          gitRunner: () => ({ status: null, stdout: "", stderr: "" }),
        }),
      ).toThrow(
        /Could not diff against "origin\/main\.\.\.HEAD"[\s\S]*exit code unknown/,
      );

      expect(() =>
        parseCollectCoverageCliArgs(["--changed", "--base", "origin/main"], {
          repoRoot: "/tmp/repo",
          gitRunner: (args) => {
            if (args[0] === "diff" && args.length === 2) {
              return {
                status: 128,
                stdout: "",
                stderr: "fatal: corrupt unstaged index",
              };
            }
            return { status: 0, stdout: "" };
          },
        }),
      ).toThrow(/git diff --name-only[\s\S]*corrupt unstaged index/);

      expect(() =>
        parseCollectCoverageCliArgs(["--changed", "--base", "origin/main"], {
          repoRoot: "/tmp/repo",
          gitRunner: (args) => {
            if (args[0] === "ls-files") {
              return {
                status: 128,
                stdout: "",
                stderr: "fatal: untracked listing failed",
              };
            }
            return { status: 0, stdout: "" };
          },
        }),
      ).toThrow(
        /git ls-files --others --exclude-standard[\s\S]*untracked listing failed/,
      );

      const nonGitTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "collect-cov-nongit-"),
      );
      try {
        expect(() =>
          parseCollectCoverageCliArgs(["--changed"], {
            repoRoot: nonGitTmpDir,
            env: { BASE_REF: "origin/main" },
          }),
        ).toThrow(/Could not diff against "origin\/main\.\.\.HEAD"/);
      } finally {
        fs.rmSync(nonGitTmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("formatCoverageFailureMessage", () => {
    it("formats Error instances and string values with a trailing summary hint", () => {
      expect(
        formatCoverageFailureMessage(
          new Error(
            "Vitest coverage failed for apps/frontend with exit code 1",
          ),
        ),
      ).toBe(
        "[collect-coverage] FAILED: Vitest coverage failed for apps/frontend with exit code 1 (inspect test/error summary above the coverage table)",
      );

      expect(formatCoverageFailureMessage("unexpected failure")).toBe(
        "[collect-coverage] FAILED: unexpected failure (inspect test/error summary above the coverage table)",
      );
    });
  });
});
