import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const binPath = resolve(__dirname, "../bin/devtools.js");

describe("CLI Browser Command Subprocess Execution (E2E)", () => {
  const testDir = join(
    homedir(),
    ".devtools-test-cli-browser-" + Math.random().toString(36).slice(2),
  );

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("status command exits 1 with diagnostic error in human mode when explicit path is invalid", async () => {
    const invalidPath = join(testDir, "non-existent-binary");
    const proc = Bun.spawn(
      ["bun", binPath, "browser", "status", "--chrome-path", invalidPath],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);

    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain(
      "Specified browser path is invalid or non-executable",
    );
    expect(stderr).toContain(invalidPath);
  });

  test("status command exits 1 with diagnostic error in human mode when explicit path is empty", async () => {
    const proc = Bun.spawn(
      ["bun", binPath, "browser", "status", "--chrome-path", ""],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);

    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain(
      "explicit --chrome-path cannot be empty or whitespace",
    );
  });

  test("status command exits 0 with details when valid browser is resolved via explicit env", async () => {
    const mockBin = join(testDir, "mock-browser.sh");
    writeFileSync(mockBin, '#!/bin/sh\necho "Mock Chromium 131.0.0"\n');
    chmodSync(mockBin, 0o755);

    const proc = Bun.spawn(["bun", binPath, "browser", "status"], {
      env: {
        ...process.env,
        DEVTOOLS_CHROME_PATH: mockBin,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await new Response(proc.stdout).text();
    expect(stdout).toContain(mockBin);
    expect(stdout).toContain("Mock Chromium 131.0.0");
    expect(stdout).toContain("explicit");
  });

  test("status command exits 0 with JSON payload in --json mode when valid browser is resolved", async () => {
    const mockBin = join(testDir, "mock-browser.sh");
    writeFileSync(mockBin, '#!/bin/sh\necho "Mock Chromium 131.0.0"\n');
    chmodSync(mockBin, 0o755);

    const proc = Bun.spawn(["bun", binPath, "browser", "status", "--json"], {
      env: {
        ...process.env,
        DEVTOOLS_CHROME_PATH: mockBin,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await new Response(proc.stdout).text();
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.found).toBe(true);
    expect(parsed.path).toBe(mockBin);
    expect(parsed.version).toBe("Mock Chromium 131.0.0");
    expect(parsed.source).toBe("explicit");
  });

  test("status command respects explicit --chrome-path flag", async () => {
    const mockBin = join(testDir, "explicit-flag-browser.sh");
    writeFileSync(mockBin, '#!/bin/sh\necho "Flag Chromium 132.0.0"\n');
    chmodSync(mockBin, 0o755);

    const proc = Bun.spawn(
      ["bun", binPath, "browser", "status", "--chrome-path", mockBin, "--json"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await new Response(proc.stdout).text();
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.found).toBe(true);
    expect(parsed.path).toBe(mockBin);
    expect(parsed.version).toBe("Flag Chromium 132.0.0");
    expect(parsed.source).toBe("explicit");
  });

  test("install command --help outputs description and --path option", async () => {
    const proc = Bun.spawn(["bun", binPath, "browser", "install", "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await new Response(proc.stdout).text();
    expect(stdout).toContain("Install Chrome for Testing");
    expect(stdout).toContain("--path <dir>");
  });

  test("status command --help outputs description and --path option", async () => {
    const proc = Bun.spawn(["bun", binPath, "browser", "status", "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await new Response(proc.stdout).text();
    expect(stdout).toContain("--path <dir>");
    expect(stdout).toContain("--chrome-path <path>");
    expect(stdout).toContain("--json");
  });
});
