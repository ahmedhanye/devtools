import { afterEach, describe, expect, it, spyOn } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  discoverLcovEntries,
  filterWorkspaceLcovRecords,
  mergeCoverage,
  mergeLcovContents,
  normalizeLcovPaths,
  runMergeCoverageCli,
} from "./merge-coverage";

describe("merge-coverage", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeTempRepo(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-cov-test-"));
    tempDirs.push(dir);
    return dir;
  }

  it("normalizes relative SF paths to repository-relative forward-slash paths", () => {
    const repoRoot = "/repo";
    const result = normalizeLcovPaths(
      {
        content: "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record\n",
        baseDir: "/repo/packages/core",
      },
      repoRoot,
    );
    expect(result).toBe(
      "TN:\nSF:packages/core/src/index.ts\nDA:1,1\nend_of_record\n",
    );
  });

  it("returns empty string for blank LCOV content", () => {
    expect(
      normalizeLcovPaths({ content: "   \n", baseDir: "/repo" }, "/repo"),
    ).toBe("");
    expect(mergeLcovContents([], "/repo")).toBe("");
  });

  it("filters cross-workspace relative records and preserves matching scripts records", () => {
    const workspaceLcov = [
      "TN:",
      "SF:../core/src/index.ts",
      "DA:1,1",
      "end_of_record",
      "TN:",
      "SF:src/runner.ts",
      "DA:1,2",
      "end_of_record",
      "",
    ].join("\n");

    const filteredWorkspace = filterWorkspaceLcovRecords(workspaceLcov, false);
    expect(filteredWorkspace).toContain("SF:src/runner.ts");
    expect(filteredWorkspace).not.toContain("SF:../core/src/index.ts");

    const scriptsLcov = [
      "TN:",
      "SF:scripts/merge-coverage/merge-coverage.ts",
      "DA:1,1",
      "end_of_record",
      "TN:",
      "SF:packages/core/src/index.ts",
      "DA:1,1",
      "end_of_record",
      "",
    ].join("\n");

    const filteredScripts = filterWorkspaceLcovRecords(scriptsLcov, true);
    expect(filteredScripts).toContain(
      "SF:scripts/merge-coverage/merge-coverage.ts",
    );
    expect(filteredScripts).not.toContain("SF:packages/core/src/index.ts");
    expect(filterWorkspaceLcovRecords("TN:\n", false)).toBe("");
  });

  it("discovers workspace and scripts LCOV files and merges them into coverage/lcov.info", () => {
    const repoRoot = makeTempRepo();
    fs.mkdirSync(path.join(repoRoot, "packages/core/coverage"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(repoRoot, "coverage/scripts"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(repoRoot, "node_modules/pkg/coverage"), {
      recursive: true,
    });

    fs.writeFileSync(
      path.join(repoRoot, "packages/core/coverage/lcov.info"),
      "TN:\nSF:src/a.ts\nDA:1,1\nend_of_record\nSF:../db/src/b.ts\nDA:1,1\nend_of_record\n",
    );
    fs.writeFileSync(
      path.join(repoRoot, "coverage/scripts/lcov.info"),
      "TN:\nSF:scripts/s.ts\nDA:1,1\nend_of_record\n",
    );
    fs.writeFileSync(
      path.join(repoRoot, "node_modules/pkg/coverage/lcov.info"),
      "TN:\nSF:ignored.ts\nDA:1,1\nend_of_record\n",
    );

    const entries = discoverLcovEntries(
      repoRoot,
      path.join(repoRoot, "coverage/lcov.info"),
    );
    expect(entries).toHaveLength(2);

    const res = mergeCoverage({ repoRoot });
    expect(res.mergedCount).toBe(2);
    const merged = fs.readFileSync(res.outputPath, "utf8");
    expect(merged).toContain("SF:packages/core/src/a.ts");
    expect(merged).toContain("SF:scripts/s.ts");
    expect(merged).not.toContain("packages/db/src/b.ts");
    expect(merged).not.toContain("ignored.ts");
  });

  it("throws when no LCOV files are found unless allowEmpty is true", () => {
    const repoRoot = makeTempRepo();
    expect(() => mergeCoverage({ repoRoot })).toThrow(
      /no LCOV coverage data was found/i,
    );
    expect(mergeCoverage({ repoRoot, allowEmpty: true }).mergedCount).toBe(0);
  });

  it("runMergeCoverageCli returns 0 on success/--allow-empty and 1 on failure", () => {
    const repoRoot = makeTempRepo();
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(runMergeCoverageCli([], { repoRoot })).toBe(1);
      expect(runMergeCoverageCli(["--allow-empty"], { repoRoot })).toBe(0);

      fs.mkdirSync(path.join(repoRoot, "packages/core/coverage"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(repoRoot, "packages/core/coverage/lcov.info"),
        "TN:\nSF:src/a.ts\nDA:1,1\nend_of_record\n",
      );
      expect(runMergeCoverageCli([], { repoRoot })).toBe(0);
    } finally {
      errSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
