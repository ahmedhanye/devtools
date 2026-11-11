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
      blocker.stop(true);
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
      proc.kill();
      rmSync(tmpDir, { recursive: true, force: true });
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
});
