import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { installBrowser } from "../src/browser/installer";

describe("Browser Installer", () => {
  const testDir = join(
    homedir(),
    ".devtools-test-installer-" + Math.random().toString(36).slice(2),
  );

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("installBrowser resolves stable buildId and downloads into cache directory (mocked)", async () => {
    let resolvedTag = "";
    let capturedOptions: any = null;
    const mockExePath = join(
      testDir,
      "chrome-headless-shell-linux64",
      "chrome-headless-shell",
    );

    const mockDeps = {
      resolveBuildId: async (_browser: any, _platform: any, tag: string) => {
        resolvedTag = tag;
        return "130.0.6723.69";
      },
      install: async (options: any) => {
        capturedOptions = options;
        if (options.downloadProgressCallback) {
          options.downloadProgressCallback(50, 100);
          options.downloadProgressCallback(100, 100);
        }
        return {
          executablePath: mockExePath,
          buildId: "130.0.6723.69",
          browser: "chrome-headless-shell",
        };
      },
    };

    const progressReports: Array<{ downloaded: number; total: number }> = [];

    const result = await installBrowser(
      {
        cacheDir: testDir,
        onProgress: (downloaded, total) => {
          progressReports.push({ downloaded, total });
        },
      },
      mockDeps,
    );

    expect(resolvedTag).toBe("stable");
    expect(capturedOptions).toBeDefined();
    expect(capturedOptions.buildId).toBe("130.0.6723.69");
    expect(capturedOptions.cacheDir).toBe(testDir);
    expect(progressReports.length).toBe(2);
    expect(progressReports[0]).toEqual({ downloaded: 50, total: 100 });
    expect(progressReports[1]).toEqual({ downloaded: 100, total: 100 });
    expect(result.executablePath).toBe(mockExePath);
    expect(result.buildId).toBe("130.0.6723.69");
    expect(result.browser).toBe("chrome-headless-shell");
  });

  test("installBrowser creates target cache directory if it does not exist", async () => {
    const nestedDir = join(testDir, "nested", "cache");
    expect(existsSync(nestedDir)).toBe(false);

    const mockDeps = {
      resolveBuildId: async () => "130.0.0",
      install: async () => ({
        executablePath: join(nestedDir, "mock"),
        buildId: "130.0.0",
        browser: "chrome-headless-shell",
      }),
    };

    await installBrowser({ cacheDir: nestedDir }, mockDeps);
    expect(existsSync(nestedDir)).toBe(true);
  });

  test("installBrowser propagates download errors", async () => {
    const mockDeps = {
      resolveBuildId: async () => "130.0.0",
      install: async () => {
        throw new Error("Network timeout during browser archive download");
      },
    };

    await expect(
      installBrowser({ cacheDir: testDir }, mockDeps),
    ).rejects.toThrow("Network timeout during browser archive download");
  });
});
