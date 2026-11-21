import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installBrowser,
  type BrowserInstallerDependencies,
} from "../src/installer";

type ResolveBuildIdArgs = Parameters<
  NonNullable<BrowserInstallerDependencies["resolveBuildId"]>
>;
type InstallOptionsArg = Parameters<
  NonNullable<BrowserInstallerDependencies["install"]>
>[0];

describe("Browser Installer", () => {
  const testDir = join(
    tmpdir(),
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
    let capturedOptions: InstallOptionsArg | null = null;
    const mockExePath = join(
      testDir,
      "chrome-headless-shell-linux64",
      "chrome-headless-shell",
    );

    const mockDeps: BrowserInstallerDependencies = {
      resolveBuildId: async (
        _browser: ResolveBuildIdArgs[0],
        _platform: ResolveBuildIdArgs[1],
        tag: string,
      ) => {
        resolvedTag = tag;
        return "130.0.6723.69";
      },
      install: async (options: InstallOptionsArg) => {
        capturedOptions = options;
        if (typeof options.downloadProgressCallback === "function") {
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
    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions!.buildId).toBe("130.0.6723.69");
    expect(capturedOptions!.cacheDir).toBe(testDir);
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

  test("installBrowser resolves cache directory from options.env when options.cacheDir is omitted", async () => {
    const envCacheDir = join(testDir, "env-cache");
    let capturedOptions: InstallOptionsArg | null = null;
    const mockDeps: BrowserInstallerDependencies = {
      resolveBuildId: async () => "130.0.0",
      install: async (options: InstallOptionsArg) => {
        capturedOptions = options;
        return {
          executablePath: join(envCacheDir, "mock"),
          buildId: "130.0.0",
          browser: "chrome-headless-shell",
        };
      },
    };

    await installBrowser(
      { env: { DEVTOOLS_BROWSERS_DIR: envCacheDir } },
      mockDeps,
    );
    expect(existsSync(envCacheDir)).toBe(true);
    expect(capturedOptions!.cacheDir).toBe(envCacheDir);
  });

  test("installBrowser aborts immediately when signal is pre-aborted or aborts mid-download, and cleans up abort listener", async () => {
    const preAborted = new AbortController();
    preAborted.abort("ctrl-c");
    let resolveBuildCalled = false;
    await expect(
      installBrowser(
        { cacheDir: join(testDir, "never-created"), signal: preAborted.signal },
        {
          resolveBuildId: async () => {
            resolveBuildCalled = true;
            return "130.0.0";
          },
          install: async () => ({
            executablePath: "/mock/chrome",
            buildId: "130.0.0",
            browser: "chrome-headless-shell",
          }),
        },
      ),
    ).rejects.toThrow("Browser installation was aborted");
    expect(resolveBuildCalled).toBe(false);
    expect(existsSync(join(testDir, "never-created"))).toBe(false);

    const midController = new AbortController();
    let rejectDownload!: (err: Error) => void;
    const midPromise = installBrowser(
      { cacheDir: testDir, signal: midController.signal },
      {
        resolveBuildId: async () => "130.0.0",
        install: () =>
          new Promise((_resolve, reject) => {
            rejectDownload = reject;
            queueMicrotask(() => midController.abort("SIGTERM"));
          }),
      },
    );
    await expect(midPromise).rejects.toThrow(
      "Browser installation was aborted",
    );
    rejectDownload(new Error("late network error"));

    const resolveSyncAbortController = new AbortController();
    let runInstallCalled = false;
    await expect(
      installBrowser(
        { cacheDir: testDir, signal: resolveSyncAbortController.signal },
        {
          resolveBuildId: async () => {
            resolveSyncAbortController.abort("sync-after-resolve");
            return "130.0.0";
          },
          install: async () => {
            runInstallCalled = true;
            return {
              executablePath: join(testDir, "chrome"),
              buildId: "130.0.0",
              browser: "chrome-headless-shell",
            };
          },
        },
      ),
    ).rejects.toThrow("Browser installation was aborted");
    expect(runInstallCalled).toBe(false);

    const okController = new AbortController();
    const ok = await installBrowser(
      { cacheDir: testDir, signal: okController.signal },
      {
        resolveBuildId: async () => "130.0.0",
        install: async () => ({
          executablePath: join(testDir, "chrome"),
          buildId: "130.0.0",
          browser: "chrome-headless-shell",
        }),
      },
    );
    expect(ok.buildId).toBe("130.0.0");
  });
});
