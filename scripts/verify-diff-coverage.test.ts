import { describe, expect, it } from "bun:test";
import {
  calculateDiffCoverage,
  generateMarkdownSummary,
  isTypeOnlySource,
  parseGitDiff,
  parseLcov,
  verifyDiffCoverage,
} from "./verify-diff-coverage";

describe("verify-diff-coverage", () => {
  describe("parseLcov", () => {
    it("parses LCOV content into file -> line -> hitCount map", () => {
      const sampleLcov = `
TN:
SF:packages/core/src/index.ts
DA:1,2
DA:2,0
DA:5,10
end_of_record
SF:apps/cli/src/daemon.ts
DA:10,1
DA:11,0
end_of_record
`.trim();

      const lcovMap = parseLcov(sampleLcov);
      expect(lcovMap.has("packages/core/src/index.ts")).toBe(true);
      expect(lcovMap.has("apps/cli/src/daemon.ts")).toBe(true);

      const coreLines = lcovMap.get("packages/core/src/index.ts")!;
      expect(coreLines.get(1)).toBe(2);
      expect(coreLines.get(2)).toBe(0);
      expect(coreLines.get(5)).toBe(10);
      expect(coreLines.has(3)).toBe(false);

      const cliLines = lcovMap.get("apps/cli/src/daemon.ts")!;
      expect(cliLines.get(10)).toBe(1);
      expect(cliLines.get(11)).toBe(0);
    });

    it("handles empty or whitespace-only LCOV gracefully", () => {
      const lcovMap = parseLcov("");
      expect(lcovMap.size).toBe(0);
    });
  });

  describe("parseGitDiff", () => {
    it("parses git diff hunk headers to extract added and modified line numbers", () => {
      const sampleDiff = `
diff --git a/packages/core/src/index.ts b/packages/core/src/index.ts
index abc..def 100644
--- a/packages/core/src/index.ts
+++ b/packages/core/src/index.ts
@@ -10,2 +10,3 @@
 context line
+added line 11
+added line 12
@@ -25,0 +28,2 @@
+added line 28
+added line 29
diff --git a/apps/frontend/src/app.tsx b/apps/frontend/src/app.tsx
--- a/apps/frontend/src/app.tsx
+++ b/apps/frontend/src/app.tsx
@@ -5 +5 @@
-old line
+replaced line 5
`.trim();

      const diffMap = parseGitDiff(sampleDiff);
      expect(diffMap.has("packages/core/src/index.ts")).toBe(true);
      expect(diffMap.has("apps/frontend/src/app.tsx")).toBe(true);

      const coreLines = diffMap.get("packages/core/src/index.ts")!;
      expect(coreLines).toContain(11);
      expect(coreLines).toContain(12);
      expect(coreLines).toContain(28);
      expect(coreLines).toContain(29);
      expect(coreLines).not.toContain(10);

      const frontendLines = diffMap.get("apps/frontend/src/app.tsx")!;
      expect(frontendLines).toEqual([5]);
    });

    it("ignores deleted files (dev/null target)", () => {
      const sampleDiff = `
diff --git a/deleted.ts b/dev/null
deleted file mode 100644
--- a/deleted.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-line1
-line2
`.trim();

      const diffMap = parseGitDiff(sampleDiff);
      expect(diffMap.size).toBe(0);
    });

    it("ignores diff metadata lines such as '\\ No newline at end of file' without advancing line counter", () => {
      const sampleDiff = `
diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,3 @@
 context 1
+added line 2
\\ No newline at end of file
+added line 3
`.trim();

      const diffMap = parseGitDiff(sampleDiff);
      const lines = diffMap.get("file.ts")!;
      // Line 2 was added at 2; the metadata line should not advance line counter to 4 for line 3
      expect(lines).toEqual([2, 3]);
    });

    it("correctly includes added lines starting with ++ and handles -- inside hunks", () => {
      const sampleDiff = `
diff --git a/counter.ts b/counter.ts
--- a/counter.ts
+++ b/counter.ts
@@ -1,3 +1,4 @@
 context 1
----removed;
+++counter;
+regularAdded;
`.trim();

      const diffMap = parseGitDiff(sampleDiff);
      const lines = diffMap.get("counter.ts")!;
      expect(lines).toEqual([2, 3]);
    });
  });

  describe("isTypeOnlySource", () => {
    it("identifies pure TypeScript type aliases, interfaces, and type re-exports as type-only", () => {
      expect(isTypeOnlySource("export type User = { id: string };")).toBe(true);
      expect(
        isTypeOnlySource("export interface Config { timeout: number; }"),
      ).toBe(true);
      expect(
        isTypeOnlySource(
          'import type { Foo } from "./foo"; export type { Foo };',
        ),
      ).toBe(true);
      expect(isTypeOnlySource("// just a comment\n")).toBe(true);
      expect(isTypeOnlySource("")).toBe(true);
    });

    it("identifies code emitting runtime statements as NOT type-only", () => {
      expect(
        isTypeOnlySource("export const API_URL = 'http://localhost';"),
      ).toBe(false);
      expect(isTypeOnlySource("export function compute() { return 42; }")).toBe(
        false,
      );
      expect(isTypeOnlySource("export enum Status { Active, Inactive }")).toBe(
        false,
      );
    });
  });

  describe("calculateDiffCoverage", () => {
    it("returns 100% diff coverage when all modified executable lines have test hits", () => {
      const diffMap = new Map<string, number[]>([
        ["packages/core/src/index.ts", [1, 2, 3]],
      ]);
      const lcovMap = new Map<string, Map<number, number>>([
        [
          "packages/core/src/index.ts",
          new Map([
            [1, 5],
            [2, 1],
            // line 3 is non-executable (e.g. comment/type), not present in LCOV
          ]),
        ],
      ]);

      const result = calculateDiffCoverage(diffMap, lcovMap, 100);
      expect(result.passed).toBe(true);
      expect(result.totalModifiedExecutableLines).toBe(2);
      expect(result.coveredModifiedLines).toBe(2);
      expect(result.diffCoveragePercent).toBe(100);
      expect(result.fileResults).toHaveLength(1);
      expect(result.fileResults[0]!.uncoveredLines).toEqual([]);
    });

    it("fails when an executable modified line has 0 test hits", () => {
      const diffMap = new Map<string, number[]>([
        ["packages/core/src/index.ts", [10, 11]],
      ]);
      const lcovMap = new Map<string, Map<number, number>>([
        [
          "packages/core/src/index.ts",
          new Map([
            [10, 3],
            [11, 0], // executable but not covered
          ]),
        ],
      ]);

      const result = calculateDiffCoverage(diffMap, lcovMap, 100);
      expect(result.passed).toBe(false);
      expect(result.totalModifiedExecutableLines).toBe(2);
      expect(result.coveredModifiedLines).toBe(1);
      expect(result.diffCoveragePercent).toBe(50);
      expect(result.fileResults[0]!.uncoveredLines).toEqual([11]);
    });

    it("fails when an entire new source file has zero test coverage", () => {
      const diffMap = new Map<string, number[]>([
        ["packages/core/src/new-feature.ts", [1, 2, 3]],
      ]);
      const lcovMap = new Map<string, Map<number, number>>();

      const result = calculateDiffCoverage(diffMap, lcovMap, 100);
      expect(result.passed).toBe(false);
      expect(result.totalModifiedExecutableLines).toBe(3);
      expect(result.coveredModifiedLines).toBe(0);
      expect(result.diffCoveragePercent).toBe(0);
      expect(result.fileResults[0]!.uncoveredLines).toEqual([1, 2, 3]);
    });

    it("passes with 100% coverage if diff contains zero executable lines (e.g. markdown, types)", () => {
      const diffMap = new Map<string, number[]>([
        ["docs/readme.md", [1, 2, 3]],
      ]);
      const lcovMap = new Map<string, Map<number, number>>();

      const result = calculateDiffCoverage(diffMap, lcovMap, 100);
      expect(result.passed).toBe(true);
      expect(result.totalModifiedExecutableLines).toBe(0);
      expect(result.coveredModifiedLines).toBe(0);
      expect(result.diffCoveragePercent).toBe(100);
    });

    it("exempts type-only TypeScript files without LCOV entries via type-only exemption", () => {
      const diffMap = new Map<string, number[]>([
        ["packages/core/src/types.ts", [1, 2, 3]],
      ]);
      const lcovMap = new Map<string, Map<number, number>>();

      const result = calculateDiffCoverage(diffMap, lcovMap, 100, {
        isTypeOnly: () => true,
      });
      expect(result.passed).toBe(true);
      expect(result.totalModifiedExecutableLines).toBe(0);
      expect(result.diffCoveragePercent).toBe(100);
      expect(result.fileResults).toHaveLength(0);
    });

    it("excludes internal scripts from diff-coverage gate while verifying application workspaces", () => {
      const diffMap = new Map<string, number[]>([
        ["scripts/my-script.ts", [10, 11]],
      ]);
      const lcovMap = new Map<string, Map<number, number>>();

      const result = calculateDiffCoverage(diffMap, lcovMap, 100);
      expect(result.passed).toBe(true);
      expect(result.totalModifiedExecutableLines).toBe(0);
      expect(result.fileResults).toHaveLength(0);
    });
  });

  describe("generateMarkdownSummary", () => {
    it("generates markdown summary for passing coverage", () => {
      const result = {
        totalModifiedExecutableLines: 10,
        coveredModifiedLines: 10,
        diffCoveragePercent: 100,
        passed: true,
        threshold: 100,
        fileResults: [
          {
            file: "packages/core/src/index.ts",
            modifiedExecutable: 10,
            covered: 10,
            percent: 100,
            uncoveredLines: [],
          },
        ],
      };

      const md = generateMarkdownSummary(result);
      expect(md).toContain("Diff Coverage Gate: PASSED");
      expect(md).toContain("100.00%");
      expect(md).toContain("packages/core/src/index.ts");
    });

    it("generates markdown summary highlighting uncovered lines for failing coverage", () => {
      const result = {
        totalModifiedExecutableLines: 10,
        coveredModifiedLines: 8,
        diffCoveragePercent: 80,
        passed: false,
        threshold: 100,
        fileResults: [
          {
            file: "packages/core/src/index.ts",
            modifiedExecutable: 10,
            covered: 8,
            percent: 80,
            uncoveredLines: [15, 22],
          },
        ],
      };

      const md = generateMarkdownSummary(result);
      expect(md).toContain("Diff Coverage Gate: FAILED");
      expect(md).toContain("80.00%");
      expect(md).toContain("15, 22");
    });
  });

  describe("verifyDiffCoverage", () => {
    it("fails closed when git diff against baseRef fails, without falling back to HEAD^...HEAD", () => {
      const gitCalls: string[][] = [];
      const errorLogs: string[] = [];

      const exitCode = verifyDiffCoverage({
        baseRef: "origin/main",
        headRef: "HEAD",
        lcovPath: "coverage/lcov.info",
        fileExists: () => true,
        readFile: () =>
          "TN:\nSF:packages/core/src/index.ts\nDA:1,1\nend_of_record",
        gitCommand: (args) => {
          gitCalls.push(args);
          if (args[0] === "diff" && args.includes("origin/main...HEAD")) {
            return {
              status: 128,
              stdout: "",
              stderr: "fatal: bad revision 'origin/main...HEAD'",
            };
          }
          return { status: 0, stdout: "", stderr: "" };
        },
        error: (msg) => errorLogs.push(msg),
        log: () => {},
      });

      expect(exitCode).toBe(1);
      const madeFallbackCall = gitCalls.some((args) =>
        args.includes("HEAD^...HEAD"),
      );
      expect(madeFallbackCall).toBe(false);
      expect(
        errorLogs.some((msg) => msg.includes("git fetch origin main")),
      ).toBe(true);
    });

    it("passes when diff coverage meets threshold", () => {
      const exitCode = verifyDiffCoverage({
        baseRef: "origin/main",
        headRef: "HEAD",
        lcovPath: "coverage/lcov.info",
        fileExists: () => true,
        readFile: () =>
          "TN:\nSF:packages/core/src/index.ts\nDA:1,1\nend_of_record",
        gitCommand: (args) => {
          if (args[0] === "merge-base") {
            return { status: 0, stdout: "abc1234", stderr: "" };
          }
          if (args[0] === "status") {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (args[0] === "diff") {
            return {
              status: 0,
              stdout:
                "diff --git a/packages/core/src/index.ts b/packages/core/src/index.ts\n--- a/packages/core/src/index.ts\n+++ b/packages/core/src/index.ts\n@@ -1 +1 @@\n+export const a = 1;",
              stderr: "",
            };
          }
          return { status: 0, stdout: "", stderr: "" };
        },
        log: () => {},
        error: () => {},
      });

      expect(exitCode).toBe(0);
    });

    it("fails closed when lcov coverage file does not exist", () => {
      const errorLogs: string[] = [];
      const exitCode = verifyDiffCoverage({
        lcovPath: "nonexistent/lcov.info",
        fileExists: () => false,
        error: (msg) => errorLogs.push(msg),
        log: () => {},
      });

      expect(exitCode).toBe(1);
      expect(
        errorLogs.some((msg) => msg.includes("LCOV coverage file not found")),
      ).toBe(true);
    });
  });
});
