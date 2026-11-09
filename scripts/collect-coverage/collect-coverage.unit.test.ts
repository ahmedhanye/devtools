import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import {
  collectCoverage,
  mergeLcovContents,
  normalizeLcovPaths,
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
  });
});
