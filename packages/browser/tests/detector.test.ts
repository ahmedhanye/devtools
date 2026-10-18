import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getManagedCacheDir,
  probeAlternativeBrowsers,
  probeManagedCache,
  probeSystemInstallations,
  probeToolCaches,
  verifyBrowserExecutable,
} from "../src/browser/detector";

describe("Browser Detector & Executable Verification", () => {
  const testDir = join(
    homedir(),
    ".devtools-test-detector-" + Math.random().toString(36).slice(2),
  );

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("verifyBrowserExecutable succeeds and returns version for executable exiting 0", async () => {
    const mockBin = join(testDir, "mock-browser.sh");
    writeFileSync(mockBin, '#!/bin/sh\necho "Google Chrome 130.0.6723.69"\n');
    chmodSync(mockBin, 0o755);

    const result = await verifyBrowserExecutable(mockBin, 3000);
    expect(result.valid).toBe(true);
    expect(result.version).toBe("Google Chrome 130.0.6723.69");
  });

  test("verifyBrowserExecutable returns valid=false for non-existent binary", async () => {
    const result = await verifyBrowserExecutable(
      join(testDir, "non-existent-binary"),
      1000,
    );
    expect(result.valid).toBe(false);
    expect(result.version).toBeUndefined();
  });

  test("verifyBrowserExecutable returns valid=false for non-executable file", async () => {
    const mockBin = join(testDir, "mock-unexecutable");
    writeFileSync(mockBin, 'echo "test"');
    chmodSync(mockBin, 0o644);

    const result = await verifyBrowserExecutable(mockBin, 1000);
    expect(result.valid).toBe(false);
  });

  test("verifyBrowserExecutable returns valid=false for binary exiting non-zero", async () => {
    const mockBin = join(testDir, "mock-failing.sh");
    writeFileSync(mockBin, "#!/bin/sh\nexit 1\n");
    chmodSync(mockBin, 0o755);

    const result = await verifyBrowserExecutable(mockBin, 1000);
    expect(result.valid).toBe(false);
  });

  test("verifyBrowserExecutable returns valid=false when execution exceeds timeout", async () => {
    const mockBin = join(testDir, "mock-hanging.sh");
    writeFileSync(mockBin, "#!/bin/sh\nsleep 2\necho 'done'\n");
    chmodSync(mockBin, 0o755);

    const result = await verifyBrowserExecutable(mockBin, 100);
    expect(result.valid).toBe(false);
  });

  test("verifyBrowserExecutable does not deadlock when executable produces heavy stderr", async () => {
    const mockBin = join(testDir, "mock-noisy-stderr.sh");
    writeFileSync(
      mockBin,
      '#!/bin/sh\nfor i in $(seq 1 500); do echo "Diagnostic log line $i" >&2; done\necho "Google Chrome 132.0.0.0"\n',
    );
    chmodSync(mockBin, 0o755);

    const result = await verifyBrowserExecutable(mockBin, 3000);
    expect(result.valid).toBe(true);
    expect(result.version).toBe("Google Chrome 132.0.0.0");
  });

  test("getManagedCacheDir resolves DEVTOOLS_BROWSERS_DIR override or default", () => {
    expect(getManagedCacheDir({ DEVTOOLS_BROWSERS_DIR: "/custom/cache" })).toBe(
      "/custom/cache",
    );
    expect(getManagedCacheDir({})).toBe(
      join(homedir(), ".devtools", "browsers"),
    );
    expect(getManagedCacheDir({ DEVTOOLS_BROWSERS_DIR: "" })).toBe(
      join(homedir(), ".devtools", "browsers"),
    );
    expect(getManagedCacheDir({ DEVTOOLS_BROWSERS_DIR: "   " })).toBe(
      join(homedir(), ".devtools", "browsers"),
    );
  });

  test("probeSystemInstallations returns array without throwing even if none found", async () => {
    const installations = await probeSystemInstallations();
    expect(Array.isArray(installations)).toBe(true);
  });

  test("probeAlternativeBrowsers returns array of existing browser paths", async () => {
    const altBrowsers = await probeAlternativeBrowsers();
    expect(Array.isArray(altBrowsers)).toBe(true);
  });

  test("probeManagedCache returns null when cache is empty", async () => {
    const result = await probeManagedCache(testDir);
    expect(result).toBeNull();
  });

  test("probeManagedCache falls back to getManagedCacheDir when cacheDir is empty or whitespace", async () => {
    const env = { DEVTOOLS_BROWSERS_DIR: join(testDir, "empty-cache") };
    const result1 = await probeManagedCache("", env);
    expect(result1).toBeNull();
    const result2 = await probeManagedCache("   ", env);
    expect(result2).toBeNull();
  });

  test("probeToolCaches discovers modern Playwright chrome-linux64 and chrome-headless-shell-linux64 binaries", async () => {
    const mockHome = join(testDir, "home");
    const localAppData = join(mockHome, "AppData", "Local");
    const playwrightDir = join(
      mockHome,
      process.platform === "darwin"
        ? "Library/Caches/ms-playwright"
        : process.platform === "win32"
          ? "AppData/Local/ms-playwright"
          : ".cache/ms-playwright",
      "chromium-1148",
      "chrome-linux64",
    );
    mkdirSync(playwrightDir, { recursive: true });
    const mockExecutable = join(playwrightDir, "chrome");
    writeFileSync(mockExecutable, "#!/bin/sh\necho 1\n");
    chmodSync(mockExecutable, 0o755);

    const candidates = await probeToolCaches(mockHome, {
      LOCALAPPDATA: localAppData,
    });
    const matched = candidates.find((c) => c.path === mockExecutable);
    expect(matched).toBeDefined();
    expect(matched?.source).toBe("playwright");
  });

  test("probeToolCaches discovers Playwright in PLAYWRIGHT_BROWSERS_PATH override", async () => {
    const customPlaywrightDir = join(testDir, "custom-pw");
    const browserDir = join(
      customPlaywrightDir,
      "chromium-2000",
      "chrome-linux",
    );
    mkdirSync(browserDir, { recursive: true });
    const mockExe = join(browserDir, "chrome");
    writeFileSync(mockExe, "#!/bin/sh\nexit 0\n");
    chmodSync(mockExe, 0o755);

    const candidates = await probeToolCaches(
      join(testDir, "nonexistent-home"),
      {
        PLAYWRIGHT_BROWSERS_PATH: customPlaywrightDir,
      },
    );
    const found = candidates.find((c) => c.path === mockExe);
    expect(found).toBeDefined();
    expect(found?.source).toBe("playwright");
  });

  test("probeToolCaches honors PLAYWRIGHT_BROWSERS_PATH=0 gracefully", async () => {
    const candidates = await probeToolCaches(
      join(testDir, "nonexistent-home"),
      {
        PLAYWRIGHT_BROWSERS_PATH: "0",
      },
    );
    expect(Array.isArray(candidates)).toBe(true);
  });

  test("probeToolCaches resolves relative PLAYWRIGHT_BROWSERS_PATH using INIT_CWD", async () => {
    const customPlaywrightDir = join(testDir, "init-cwd-base", "relative-pw");
    const browserDir = join(
      customPlaywrightDir,
      "chromium-2002",
      "chrome-linux",
    );
    mkdirSync(browserDir, { recursive: true });
    const mockExe = join(browserDir, "chrome");
    writeFileSync(mockExe, "#!/bin/sh\nexit 0\n");
    chmodSync(mockExe, 0o755);

    const candidates = await probeToolCaches(
      join(testDir, "nonexistent-home"),
      {
        INIT_CWD: join(testDir, "init-cwd-base"),
        PLAYWRIGHT_BROWSERS_PATH: "relative-pw",
      },
    );
    const found = candidates.find((c) => c.path === mockExe);
    expect(found).toBeDefined();
    expect(found?.source).toBe("playwright");
  });

  test("probeToolCaches discovers Playwright in XDG_CACHE_HOME on Linux", async () => {
    if (process.platform !== "linux") return;
    const customXdg = join(testDir, "custom-xdg");
    const browserDir = join(
      customXdg,
      "ms-playwright",
      "chromium-2001",
      "chrome-linux",
    );
    mkdirSync(browserDir, { recursive: true });
    const mockExe = join(browserDir, "chrome");
    writeFileSync(mockExe, "#!/bin/sh\nexit 0\n");
    chmodSync(mockExe, 0o755);

    const candidates = await probeToolCaches(
      join(testDir, "nonexistent-home"),
      {
        XDG_CACHE_HOME: customXdg,
      },
    );
    const found = candidates.find((c) => c.path === mockExe);
    expect(found).toBeDefined();
    expect(found?.source).toBe("playwright");
  });

  test("probeToolCaches discovers Puppeteer in PUPPETEER_CACHE_DIR override", async () => {
    const customPuppeteerDir = join(testDir, "custom-puppeteer");
    const browserDir = join(
      customPuppeteerDir,
      "chrome",
      "linux-130.0.6723.69",
      "chrome-linux64",
    );
    mkdirSync(browserDir, { recursive: true });
    const mockExe = join(browserDir, "chrome");
    writeFileSync(mockExe, "#!/bin/sh\nexit 0\n");
    chmodSync(mockExe, 0o755);

    const candidates = await probeToolCaches(
      join(testDir, "nonexistent-home"),
      {
        PUPPETEER_CACHE_DIR: customPuppeteerDir,
      },
    );
    const found = candidates.find((c) => c.path === mockExe);
    expect(found).toBeDefined();
    expect(found?.source).toBe("puppeteer");
  });
});
