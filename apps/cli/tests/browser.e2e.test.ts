import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

  test("install command cancels cooperatively on SIGINT (130) and SIGTERM (143) without network access", async () => {
    for (const { signal, expectedExitCode } of [
      { signal: "SIGINT" as const, expectedExitCode: 130 },
      { signal: "SIGTERM" as const, expectedExitCode: 143 },
    ]) {
      const sockets = new Set<{ terminate: () => void }>();
      const hangingProxy = Bun.listen({
        hostname: "127.0.0.1",
        port: 0,
        socket: {
          open(socket) {
            sockets.add(socket);
          },
          data() {},
          close(socket) {
            sockets.delete(socket);
          },
          error(socket) {
            sockets.delete(socket);
          },
        },
      });

      const cacheDir = join(testDir, `cache-${signal.toLowerCase()}`);
      const proxyUrl = `http://127.0.0.1:${hangingProxy.port}`;
      const proc = Bun.spawn(
        ["bun", binPath, "browser", "install", "--path", cacheDir],
        {
          env: {
            ...process.env,
            NO_COLOR: "1",
            HTTPS_PROXY: proxyUrl,
            HTTP_PROXY: proxyUrl,
            https_proxy: proxyUrl,
            http_proxy: proxyUrl,
            NO_PROXY: "",
            no_proxy: "",
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      try {
        const reader = proc.stderr.getReader();
        const decoder = new TextDecoder();
        let stderr = "";
        let signaled = false;
        const deadline = Date.now() + 10000;

        try {
          while (Date.now() < deadline) {
            const remaining = Math.max(10, deadline - Date.now());
            const raced = await Promise.race([
              reader.read().then((res) => ({ kind: "read" as const, res })),
              Bun.sleep(remaining).then(() => ({ kind: "timeout" as const })),
            ]);
            if (raced.kind === "timeout") {
              throw new Error(
                `Timed out waiting for browser install ${signal} shutdown: ${stderr}`,
              );
            }
            if (raced.res.done) {
              stderr += decoder.decode();
              break;
            }
            stderr += decoder.decode(raced.res.value, { stream: true });
            if (!signaled && stderr.includes("Installing Chrome for Testing")) {
              signaled = true;
              proc.kill(signal);
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
        }

        const exitCode = await proc.exited;
        const stdout = await new Response(proc.stdout).text();

        expect(signaled).toBe(true);
        expect(exitCode).toBe(expectedExitCode);
        expect(stdout).toBe("");
        expect(stderr).toContain(`Received ${signal}. Shutting down...`);
        expect(stderr).toContain(
          "Failed to install browser: Browser installation was aborted",
        );
      } finally {
        if (proc.exitCode === null) {
          proc.kill("SIGKILL");
          await proc.exited;
        }
        for (const socket of sockets) {
          socket.terminate();
        }
        hangingProxy.stop(true);
      }
    }
  }, 20000);

  test("status command exits 130 cleanly on SIGINT while probing a slow binary", async () => {
    const markerPath = join(testDir, "probe-started");
    const slowBrowser = join(testDir, "slow-browser.sh");
    writeFileSync(
      slowBrowser,
      `#!/bin/sh\nprintf "started" > "${markerPath}"\nexec sleep 10\n`,
    );
    chmodSync(slowBrowser, 0o755);

    const proc = Bun.spawn(
      ["bun", binPath, "browser", "status", "--chrome-path", slowBrowser],
      {
        env: {
          ...process.env,
          NO_COLOR: "1",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const deadline = Date.now() + 8000;
      while (!existsSync(markerPath) && Date.now() < deadline) {
        await Bun.sleep(10);
      }
      expect(existsSync(markerPath)).toBe(true);

      proc.kill("SIGINT");
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      expect(exitCode).toBe(130);
      expect(stdout).toBe("");
      expect(stderr).toContain("Received SIGINT. Shutting down...");
      expect(stderr).not.toContain("Browser resolution was aborted");
    } finally {
      if (proc.exitCode === null) {
        proc.kill("SIGKILL");
        await proc.exited;
      }
    }
  });
});
