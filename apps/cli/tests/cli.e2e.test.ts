import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  APP_VERSION,
  ApiErrorResponseSchema,
  HealthResponseSchema,
} from "@devtools/core";
import { openDb } from "@devtools/db";
import { createLighthouseStore } from "@devtools/lighthouse";
import {
  AuditSseErrorEventSchema,
  AuditSseProgressEventSchema,
  ListLighthouseRunsResponseSchema,
  TriggerLighthouseAuditResponseSchema,
} from "@devtools/lighthouse/schemas";
import {
  getEphemeralPort,
  getFreePort,
  waitForServer,
} from "./support/network";

const binPath = resolve(__dirname, "../bin/devtools.js");
const compiledBinPath = resolve(__dirname, "../../../dist/devtools");

function createSanitizedEnv(
  overrides: Record<string, string> = {},
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    DEVTOOLS_DB_PATH: ":memory:",
  };
  delete env.HOST;
  delete env.PORT;
  return { ...env, ...overrides };
}

async function readDaemonPort(
  stream: ReadableStream<Uint8Array>,
  timeoutMs = 8000,
): Promise<number> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let collected = "";
  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(10, deadline - Date.now());
      const raced = await Promise.race([
        reader.read().then((res) => ({ kind: "read" as const, res })),
        Bun.sleep(remaining).then(() => ({ kind: "timeout" as const })),
      ]);
      if (raced.kind === "timeout" || raced.res.done) {
        break;
      }
      collected += decoder.decode(raced.res.value, { stream: true });
      const match = collected.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match?.[1]) {
        return Number.parseInt(match[1], 10);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  throw new Error(`Timed out waiting for daemon port in stdout: ${collected}`);
}

describe("CLI Subprocess Integration Tests (E2E)", () => {
  test("boots daemon via 'devtools web --port <port> --host 127.0.0.1', serves routes, and exits code 0 on SIGTERM", async () => {
    const port = getFreePort();
    const proc = Bun.spawn(
      ["bun", binPath, "web", "--port", String(port), "--host", "127.0.0.1"],
      {
        env: createSanitizedEnv(),
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const ready = await waitForServer(port, "127.0.0.1");
      expect(ready).toBe(true);

      const indexRes = await fetch(`http://127.0.0.1:${port}/`);
      expect(indexRes.status).toBe(200);
      const html = await indexRes.text();
      expect(html).toContain("<!DOCTYPE html>");

      const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(healthRes.status).toBe(200);
      const json = await healthRes.json();
      expect(HealthResponseSchema.parse(json).status).toBe("ok");

      proc.kill("SIGTERM");
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      expect(stdout).toContain(
        `DevTools daemon listening on http://127.0.0.1:${port}`,
      );
      expect(stderr).toContain("Received SIGTERM. Shutting down");
    } finally {
      proc.kill();
    }
  });

  test("exits code 0 on SIGINT", async () => {
    const port = getFreePort();
    const proc = Bun.spawn(
      ["bun", binPath, "web", "-p", String(port), "-H", "127.0.0.1"],
      {
        env: createSanitizedEnv(),
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const ready = await waitForServer(port, "127.0.0.1");
      expect(ready).toBe(true);

      proc.kill("SIGINT");
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);

      const stderr = await new Response(proc.stderr).text();
      expect(stderr).toContain("Received SIGINT. Shutting down");
    } finally {
      proc.kill();
    }
  });

  test("fails fast with exit code 1 on port conflict in non-interactive mode", async () => {
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("blocking");
      },
    });
    const occupiedPort = blocker.port ?? 0;

    try {
      const proc = Bun.spawn(
        [
          "bun",
          binPath,
          "web",
          "--port",
          String(occupiedPort),
          "--host",
          "127.0.0.1",
        ],
        {
          env: createSanitizedEnv(),
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      try {
        const exitCode = await proc.exited;
        expect(exitCode).toBe(1);

        const stderr = await new Response(proc.stderr).text();
        expect(stderr).toContain(`Port ${occupiedPort} is already in use`);
        expect(stderr).toContain(`Use --port <port> or set PORT=<port>`);
      } finally {
        proc.kill();
      }
    } finally {
      await blocker.stop(true);
    }
  });

  test("fails fast with exit code 1 when static directory does not exist", async () => {
    const port = getFreePort();
    const proc = Bun.spawn(
      [
        "bun",
        binPath,
        "web",
        "-p",
        String(port),
        "--static-dir",
        "/invalid/dir/that/does/not/exist",
      ],
      {
        env: createSanitizedEnv(),
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const exitCode = await proc.exited;
      expect(exitCode).toBe(1);

      const stderr = await new Response(proc.stderr).text();
      expect(stderr).toContain("Static assets directory not found");
      expect(stderr).toContain("bun run build");
    } finally {
      proc.kill();
    }
  });

  test("fails fast with exit code 1 on invalid port numbers (-1, 65536, abc, 4000abc)", async () => {
    for (const badPort of ["-1", "65536", "abc", "4000abc"]) {
      const proc = Bun.spawn(
        ["bun", binPath, "web", "--port", badPort, "--host", "127.0.0.1"],
        {
          env: createSanitizedEnv(),
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      try {
        const exitCode = await proc.exited;
        expect(exitCode).toBe(1);
        expect(await new Response(proc.stdout).text()).toBe("");
        expect(await new Response(proc.stderr).text()).toMatch(
          /Invalid port|between 0 and 65535/i,
        );
      } finally {
        proc.kill();
      }
    }
  });

  test("fails fast with friendly error on malformed PORT environment variable", async () => {
    const proc = Bun.spawn(["bun", binPath, "web", "-H", "127.0.0.1"], {
      env: createSanitizedEnv({ PORT: "4000.5" }),
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const exitCode = await proc.exited;
      expect(exitCode).toBe(1);

      const stderr = await new Response(proc.stderr).text();
      expect(stderr).toContain(
        'Invalid environment variable PORT="4000.5": must be an integer between 0 and 65535',
      );
      expect(stderr).not.toContain('"code":');
    } finally {
      proc.kill();
    }
  });

  test("respects PORT environment variable when --port is omitted", async () => {
    const port = getFreePort();
    const proc = Bun.spawn(["bun", binPath, "web", "-H", "127.0.0.1"], {
      env: createSanitizedEnv({ PORT: String(port) }),
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const ready = await waitForServer(port, "127.0.0.1");
      expect(ready).toBe(true);

      const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(healthRes.status).toBe(200);

      proc.kill("SIGTERM");
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
    } finally {
      proc.kill();
    }
  });

  async function assertLighthouseDaemonLifecycle(
    spawnCmd: (port: number, staticDir?: string) => string[],
    options: { withTempStaticDir?: boolean } = {},
  ): Promise<void> {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-cli-e2e-lh-"));
    const dbPath = join(tmpDir, "e2e.db");
    const artifactsDir = join(tmpDir, "artifacts");
    let staticDir: string | undefined;
    if (options.withTempStaticDir) {
      staticDir = join(tmpDir, "static");
      mkdirSync(staticDir, { recursive: true });
      writeFileSync(
        join(staticDir, "index.html"),
        "<!DOCTYPE html><html></html>",
      );
    }
    const port = getFreePort();
    const proc = Bun.spawn(spawnCmd(port, staticDir), {
      env: createSanitizedEnv({
        DEVTOOLS_DB_PATH: dbPath,
        DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR: artifactsDir,
        DEVTOOLS_CHROME_PATH: "/nonexistent/devtools-e2e-chrome",
      }),
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const ready = await waitForServer(port, "127.0.0.1");
      expect(ready).toBe(true);
      const baseUrl = `http://127.0.0.1:${port}`;

      const healthRes = await fetch(`${baseUrl}/api/health`);
      expect(healthRes.status).toBe(200);

      const runsRes = await fetch(`${baseUrl}/api/lighthouse/runs`);
      expect(runsRes.status).toBe(200);
      expect(
        ListLighthouseRunsResponseSchema.parse(await runsRes.json()).total,
      ).toBe(0);

      const postRes = await fetch(`${baseUrl}/api/lighthouse/audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/" }),
      });
      expect(postRes.status).toBe(202);
      const { job } = TriggerLighthouseAuditResponseSchema.parse(
        await postRes.json(),
      );

      const sseRes = await fetch(
        `${baseUrl}/api/lighthouse/audits/${job.id}/stream`,
      );
      expect(sseRes.status).toBe(200);
      const sseText = await sseRes.text();
      expect(sseText).toContain("event: error");

      const dataLines = sseText
        .split("\n\n")
        .map((chunk) => {
          const event = chunk.match(/^event:\s*(.+)$/m)?.[1];
          const data = chunk.match(/^data:\s*(.+)$/m)?.[1];
          return { event, data };
        })
        .filter((f) => f.event && f.data);

      const progressFrame = dataLines.find((f) => f.event === "progress");
      if (progressFrame) {
        expect(
          AuditSseProgressEventSchema.parse(JSON.parse(progressFrame.data!))
            .stage,
        ).toBe("locating_browser");
      }

      const errorFrame = dataLines.find((f) => f.event === "error");
      expect(errorFrame).toBeDefined();
      expect(
        AuditSseErrorEventSchema.parse(JSON.parse(errorFrame!.data!)).error
          .code,
      ).toBe("INVALID_BROWSER_PATH");

      proc.kill("SIGTERM");
      expect(await proc.exited).toBe(0);
    } finally {
      try {
        proc.kill();
        await proc.exited;
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  }

  test("executes Lighthouse API endpoints and SSE lifecycle through devtools web daemon", async () => {
    await assertLighthouseDaemonLifecycle((port) => [
      "bun",
      binPath,
      "web",
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
    ]);
  });

  test("executes compiled dist/devtools web with embedded migrations and Lighthouse SSE lifecycle", async () => {
    if (!existsSync(compiledBinPath)) {
      throw new Error(
        `Compiled binary not found at ${compiledBinPath}. Run 'bun run build:bin' first.`,
      );
    }

    await assertLighthouseDaemonLifecycle(
      (port, staticDir) => [
        compiledBinPath,
        "web",
        "--port",
        String(port),
        "--host",
        "127.0.0.1",
        "--static-dir",
        staticDir!,
      ],
      { withTempStaticDir: true },
    );
  });
});

describe("End-to-End Interconnected Stack Integration (CLI -> Daemon -> UI -> API -> Core)", () => {
  test("starts daemon via CLI, delivers static UI assets, routes API requests, and verifies contracts end-to-end", async () => {
    const port = getEphemeralPort();
    const daemonProc = Bun.spawn(
      ["bun", binPath, "web", "--port", String(port), "--host", "127.0.0.1"],
      {
        env: createSanitizedEnv(),
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const isUp = await waitForServer(port);
      expect(isUp).toBe(true);

      const baseUrl = `http://127.0.0.1:${port}`;

      const indexRes = await fetch(`${baseUrl}/`);
      expect(indexRes.status).toBe(200);
      expect(indexRes.headers.get("content-type")).toContain("text/html");

      const indexHtml = await indexRes.text();
      expect(indexHtml).toContain("<!DOCTYPE html>");
      expect(indexHtml).toContain('data-slot="sidebar-wrapper"');

      const cssMatch = indexHtml.match(
        /href="(\/_next\/static\/chunks\/[^"]+\.css)"/,
      );
      if (cssMatch && cssMatch[1]) {
        const cssRes = await fetch(`${baseUrl}${cssMatch[1]}`);
        expect(cssRes.status).toBe(200);
        expect(cssRes.headers.get("content-type")).toContain("text/css");
      }

      const jsMatch = indexHtml.match(
        /src="(\/_next\/static\/chunks\/[^"]+\.js)"/,
      );
      if (jsMatch && jsMatch[1]) {
        const jsRes = await fetch(`${baseUrl}${jsMatch[1]}`);
        expect(jsRes.status).toBe(200);
        const jsContentType = jsRes.headers.get("content-type") ?? "";
        expect(
          jsContentType.includes("javascript") ||
            jsContentType.includes("application/octet-stream") ||
            jsContentType.includes("text/plain"),
        ).toBe(true);
      }

      const static404Res = await fetch(`${baseUrl}/nonexistent-page-route`);
      expect(static404Res.status).toBe(404);
      expect(static404Res.headers.get("content-type")).toContain("text/html");
      const static404Html = await static404Res.text();
      expect(static404Html).toContain("404");

      const healthRes = await fetch(`${baseUrl}/api/health`);
      expect(healthRes.status).toBe(200);
      expect(healthRes.headers.get("content-type")).toContain(
        "application/json",
      );

      const healthPayload = await healthRes.json();
      const validatedHealth = HealthResponseSchema.parse(healthPayload);
      expect(validatedHealth.status).toBe("ok");
      expect(validatedHealth.version).toBe(APP_VERSION);
      expect(validatedHealth.uptime).toBeGreaterThanOrEqual(0);
      expect(new Date(validatedHealth.timestamp).getTime()).not.toBeNaN();

      const api404Res = await fetch(`${baseUrl}/api/nonexistent-endpoint`);
      expect(api404Res.status).toBe(404);
      expect(api404Res.headers.get("content-type")).toContain(
        "application/json",
      );

      const api404Payload = await api404Res.json();
      const validatedError = ApiErrorResponseSchema.parse(api404Payload);
      expect(validatedError.error.code).toBe("NOT_FOUND");
      expect(validatedError.error.message).toContain("not found");

      daemonProc.kill("SIGTERM");
      const exitCode = await daemonProc.exited;
      expect(exitCode).toBe(0);

      const stdout = await new Response(daemonProc.stdout).text();
      const stderr = await new Response(daemonProc.stderr).text();
      expect(stdout).toContain(
        `DevTools daemon listening on http://127.0.0.1:${port}`,
      );
      expect(stderr).toContain("Received SIGTERM. Shutting down");
    } finally {
      daemonProc.kill();
    }
  });

  test("rejects empty --host, HOST, and --static-dir inputs with actionable stderr errors", async () => {
    const cases: Array<{
      args: string[];
      env: Record<string, string>;
      expected: string;
    }> = [
      {
        args: ["web", "--port", "0", "--host", ""],
        env: {},
        expected:
          'Invalid --host "": must be a non-empty hostname or IP address',
      },
      {
        args: ["web", "--port", "0"],
        env: { HOST: "" },
        expected:
          'Invalid environment variable HOST="": must be a non-empty hostname or IP address',
      },
      {
        args: ["web", "--port", "0", "--static-dir", ""],
        env: {},
        expected: "Invalid --static-dir: path must not be empty",
      },
    ];

    for (const testCase of cases) {
      const proc = Bun.spawn(["bun", binPath, ...testCase.args], {
        env: createSanitizedEnv({ NO_COLOR: "1", ...testCase.env }),
        stdout: "pipe",
        stderr: "pipe",
      });
      try {
        expect(await proc.exited).toBe(1);
        expect(await new Response(proc.stdout).text()).toBe("");
        const stderr = await new Response(proc.stderr).text();
        expect(stderr).toContain(testCase.expected);
        expect(stderr).not.toContain("Too small");
      } finally {
        proc.kill();
      }
    }
  });

  test("binds --port 0 dynamically and keeps DB and artifacts lazy until DB-backed routes run", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-cli-e2e-lazy-"));
    const dbPath = join(tmpDir, "lazy.db");
    const artifactsDir = join(tmpDir, "artifacts");
    const proc = Bun.spawn(
      ["bun", binPath, "web", "--port", "0", "--host", "127.0.0.1"],
      {
        env: createSanitizedEnv({
          NO_COLOR: "1",
          DEVTOOLS_DB_PATH: dbPath,
          DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR: artifactsDir,
        }),
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const port = await readDaemonPort(proc.stdout);
      expect(port).toBeGreaterThan(0);
      const baseUrl = `http://127.0.0.1:${port}`;

      expect((await fetch(`${baseUrl}/`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/api/health`)).status).toBe(200);
      expect(
        (await fetch(`${baseUrl}/api/lighthouse/audits/active`)).status,
      ).toBe(200);
      expect(
        (
          await fetch(`${baseUrl}/api/lighthouse/audits`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: "not-a-valid-url" }),
          })
        ).status,
      ).toBe(422);

      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(artifactsDir)).toBe(false);

      const runsRes = await fetch(`${baseUrl}/api/lighthouse/runs`);
      expect(runsRes.status).toBe(200);
      expect(
        ListLighthouseRunsResponseSchema.parse(await runsRes.json()).total,
      ).toBe(0);
      expect(existsSync(dbPath)).toBe(true);

      proc.kill("SIGTERM");
      expect(await proc.exited).toBe(0);
    } finally {
      try {
        proc.kill();
        await proc.exited;
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  test("compiled dist/devtools outside repo resolves DB under $HOME/.devtools/devtools.db", async () => {
    if (!existsSync(compiledBinPath)) {
      throw new Error(
        `Compiled binary not found at ${compiledBinPath}. Run 'bun run build:bin' first.`,
      );
    }

    const tmpRoot = mkdtempSync(join(tmpdir(), "devtools-cli-e2e-home-"));
    const outsideCwd = join(tmpRoot, "outside-cwd");
    const fakeHome = join(tmpRoot, "home");
    const staticDir = join(tmpRoot, "static");
    mkdirSync(outsideCwd, { recursive: true });
    mkdirSync(fakeHome, { recursive: true });
    mkdirSync(staticDir, { recursive: true });
    writeFileSync(
      join(staticDir, "index.html"),
      "<!DOCTYPE html><html></html>",
    );

    const env = createSanitizedEnv({
      HOME: fakeHome,
      NO_COLOR: "1",
    });
    delete env.DEVTOOLS_DB_PATH;
    delete env.DATABASE_URL;
    delete env.DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR;
    delete env.NODE_ENV;
    delete env.BUN_ENV;

    const proc = Bun.spawn(
      [
        compiledBinPath,
        "web",
        "--port",
        "0",
        "--host",
        "127.0.0.1",
        "--static-dir",
        staticDir,
      ],
      {
        cwd: outsideCwd,
        env,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const port = await readDaemonPort(proc.stdout);
      const baseUrl = `http://127.0.0.1:${port}`;
      const expectedHomeDb = join(fakeHome, ".devtools", "devtools.db");

      expect((await fetch(`${baseUrl}/api/health`)).status).toBe(200);
      expect(existsSync(expectedHomeDb)).toBe(false);

      const runsRes = await fetch(`${baseUrl}/api/lighthouse/runs`);
      expect(runsRes.status).toBe(200);
      expect(existsSync(expectedHomeDb)).toBe(true);
      expect(existsSync(join(outsideCwd, ".devtools", "devtools.db"))).toBe(
        false,
      );

      proc.kill("SIGTERM");
      expect(await proc.exited).toBe(0);
    } finally {
      try {
        proc.kill();
        await proc.exited;
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    }
  });

  test("cancels active Lighthouse audit cleanly on SIGTERM to devtools web", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-cli-e2e-web-cancel-"));
    const dbPath = join(tmpDir, "cancel.db");
    const artifactsDir = join(tmpDir, "artifacts");

    const slowServer = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch() {
        await Bun.sleep(15000);
        return new Response("<html><body>Slow</body></html>", {
          headers: { "Content-Type": "text/html" },
        });
      },
    });

    const proc = Bun.spawn(
      ["bun", binPath, "web", "--port", "0", "--host", "127.0.0.1"],
      {
        env: createSanitizedEnv({
          NO_COLOR: "1",
          DEVTOOLS_DB_PATH: dbPath,
          DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR: artifactsDir,
        }),
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const port = await readDaemonPort(proc.stdout);
      const baseUrl = `http://127.0.0.1:${port}`;

      // Open SQLite in WAL mode before starting the active SSE audit
      expect((await fetch(`${baseUrl}/api/lighthouse/runs`)).status).toBe(200);
      expect(existsSync(dbPath)).toBe(true);

      const postRes = await fetch(`${baseUrl}/api/lighthouse/audits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${slowServer.url.toString()}slow-web-cancel`,
          runs: 1,
        }),
      });
      expect(postRes.status).toBe(202);
      const { job } = TriggerLighthouseAuditResponseSchema.parse(
        await postRes.json(),
      );

      const sseRes = await fetch(
        `${baseUrl}/api/lighthouse/audits/${job.id}/stream`,
      );
      expect(sseRes.status).toBe(200);
      const reader = sseRes.body!.getReader();
      const decoder = new TextDecoder();
      let sseSoFar = "";
      const deadline = Date.now() + 20000;
      let pendingRead = reader.read();

      try {
        while (Date.now() < deadline) {
          const raced = await Promise.race([
            pendingRead.then((chunk) => ({ kind: "read" as const, chunk })),
            Bun.sleep(100).then(() => ({ kind: "tick" as const })),
          ]);
          if (raced.kind === "read") {
            if (raced.chunk.done) break;
            sseSoFar += decoder.decode(raced.chunk.value, { stream: true });
            if (
              sseSoFar.includes("launching_browser") ||
              sseSoFar.includes("navigating")
            ) {
              break;
            }
            pendingRead = reader.read();
          }
        }

        expect(sseSoFar).toContain("event: progress");

        // Keep SSE reader open (uncancelled) across SIGTERM to verify server.stop(true)
        const streamClosed = (async () => {
          try {
            while (true) {
              const { done } = await reader.read();
              if (done) return true;
            }
          } catch {
            return true;
          }
        })();

        proc.kill("SIGTERM");
        expect(await proc.exited).toBe(0);
        await expect(
          Promise.race([streamClosed, Bun.sleep(3000).then(() => false)]),
        ).resolves.toBe(true);
        expect(existsSync(`${dbPath}-wal`)).toBe(false);
        expect(existsSync(`${dbPath}-shm`)).toBe(false);
      } finally {
        await reader.cancel().catch(() => {});
      }

      using db = openDb({ path: dbPath });
      const store = createLighthouseStore({
        db,
        artifactsDir,
      });
      expect(
        store.listRuns().filter((r) => r.url.includes("slow-web-cancel")),
      ).toHaveLength(0);
    } finally {
      try {
        proc.kill();
        await proc.exited;
      } finally {
        await slowServer.stop(true);
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  }, 35000);

  test("DB-free CLI commands and main.ts startup load zero @devtools/db or drizzle-orm modules", async () => {
    const cliRoot = resolve(__dirname, "..");
    const script = `
      import { createBufferOutput } from "@devtools/core/node";
      import { runCli } from "./src/app/main.ts";

      const findMatches = (patterns) =>
        Object.keys(require.cache)
          .map((key) => key.replaceAll("\\\\", "/"))
          .filter((key) => patterns.some((pattern) => key.includes(pattern)));

      const dbAndEnginePatterns = [
        "packages/db",
        "@devtools/db",
        "drizzle-orm",
        "packages/lighthouse",
        "@devtools/lighthouse",
        "apps/api",
        "@devtools/api",
      ];
      const metaPatterns = [...dbAndEnginePatterns, "packages/browser", "@devtools/browser"];

      const onImportMain = findMatches(metaPatterns);
      const out = createBufferOutput();
      await runCli(["bun", "devtools", "--help"], { output: out, exit: () => {} });
      await runCli(["bun", "devtools", "--version"], { output: out, exit: () => {} });
      const afterMetaCommands = findMatches(metaPatterns);

      const origLog = console.log;
      const origErr = console.error;
      console.log = () => {};
      console.error = () => {};
      try {
        await runCli(
          ["bun", "devtools", "browser", "status", "--json", "--chrome-path", "/nonexistent/devtools-chrome"],
          { output: out, exit: () => {} },
        );
      } finally {
        console.log = origLog;
        console.error = origErr;
      }
      const afterBrowserStatus = findMatches(dbAndEnginePatterns);

      console.log(JSON.stringify({ onImportMain, afterMetaCommands, afterBrowserStatus }));
    `;

    const proc = Bun.spawn(["bun", "-e", script], {
      cwd: cliRoot,
      env: createSanitizedEnv({ NO_COLOR: "1" }),
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout.trim()) as {
      onImportMain: string[];
      afterMetaCommands: string[];
      afterBrowserStatus: string[];
    };
    expect(parsed.onImportMain).toEqual([]);
    expect(parsed.afterMetaCommands).toEqual([]);
    expect(parsed.afterBrowserStatus).toEqual([]);
  });
});
