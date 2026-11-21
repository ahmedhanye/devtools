import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { HealthResponseSchema } from "@devtools/core";
import { ActiveAuditJobResponseSchema } from "@devtools/lighthouse/schemas";
import { startServer } from "../src/app/server";

const serverPath = resolve(__dirname, "../src/app/server-cli.ts");

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

async function readListeningPort(
  stream: ReadableStream<Uint8Array>,
  timeoutMs = 5000,
): Promise<{
  port: number;
  readRest: () => Promise<string>;
}> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let collected = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = Math.max(10, deadline - Date.now());
    const raced = await Promise.race([
      reader.read().then((res) => ({ kind: "read" as const, res })),
      Bun.sleep(remaining).then(() => ({ kind: "timeout" as const })),
    ]);
    if (raced.kind === "timeout") {
      break;
    }
    if (raced.res.done) {
      break;
    }
    collected += decoder.decode(raced.res.value, { stream: true });
    const match = collected.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match?.[1]) {
      const port = Number.parseInt(match[1], 10);
      return {
        port,
        readRest: async () => {
          let rest = collected;
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            rest += decoder.decode(next.value, { stream: true });
          }
          return rest + decoder.decode();
        },
      };
    }
  }

  await reader.cancel().catch(() => {});
  throw new Error(
    `Timed out waiting for listening port in stdout: ${collected}`,
  );
}

describe("Standalone Server CLI Subprocess Lifecycle", () => {
  test("CLI main execution boots server, serves Lighthouse API, and exits gracefully on SIGTERM", async () => {
    const temp = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response();
      },
    });
    const freePort = temp.port;
    await temp.stop(true);

    const proc = Bun.spawn(["bun", serverPath], {
      env: createSanitizedEnv({
        HOST: "127.0.0.1",
        PORT: String(freePort),
      }),
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      let ready = false;
      for (let i = 0; i < 40; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${freePort}/api/health`);
          if (res.status === 200) {
            ready = true;
            break;
          }
        } catch {
          await Bun.sleep(50);
        }
      }
      expect(ready).toBe(true);

      const healthRes = await fetch(`http://127.0.0.1:${freePort}/api/health`);
      expect(healthRes.status).toBe(200);
      expect(HealthResponseSchema.parse(await healthRes.json()).status).toBe(
        "ok",
      );

      const activeRes = await fetch(
        `http://127.0.0.1:${freePort}/api/lighthouse/audits/active`,
      );
      expect(activeRes.status).toBe(200);
      expect(
        ActiveAuditJobResponseSchema.parse(await activeRes.json()).active,
      ).toBe(false);

      proc.kill("SIGTERM");
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);

      const stdout = await new Response(proc.stdout).text();
      expect(stdout).toContain("Server listening on http://127.0.0.1:");
      expect(stdout).toContain("Shutting down server...");
    } finally {
      proc.kill();
    }
  });

  test("CLI main execution logs diagnostic error on EADDRINUSE conflict and exits with code 1", async () => {
    const activeInstance = startServer({
      port: 0,
      hostname: "127.0.0.1",
      env: { DEVTOOLS_DB_PATH: ":memory:" },
    });
    const occupiedPort = activeInstance.port;

    try {
      const proc = Bun.spawn(["bun", serverPath], {
        env: createSanitizedEnv({
          HOST: "127.0.0.1",
          PORT: String(occupiedPort),
        }),
        stdout: "pipe",
        stderr: "pipe",
      });

      try {
        const exitCode = await proc.exited;
        expect(exitCode).toBe(1);

        const stderr = await new Response(proc.stderr).text();
        expect(stderr).toContain(
          `Port ${occupiedPort} is already in use. Set PORT=<port> to use an alternate port.`,
        );
      } finally {
        proc.kill();
      }
    } finally {
      await activeInstance.stop();
    }
  });

  test("CLI main execution binds PORT=0 ephemerally and exits gracefully on SIGINT", async () => {
    const proc = Bun.spawn(["bun", serverPath], {
      env: createSanitizedEnv({
        HOST: "127.0.0.1",
        PORT: "0",
      }),
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const { port, readRest } = await readListeningPort(proc.stdout);
      expect(port).toBeGreaterThan(0);

      const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(healthRes.status).toBe(200);
      expect(HealthResponseSchema.parse(await healthRes.json()).status).toBe(
        "ok",
      );

      proc.kill("SIGINT");
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);

      const stdout = await readRest();
      expect(stdout).toContain(`Server listening on http://127.0.0.1:${port}`);
      expect(stdout).toContain("Shutting down server...");
    } finally {
      proc.kill();
    }
  });

  test("CLI main execution logs actionable PORT and HOST errors and exits code 1", async () => {
    const cases = [
      {
        env: { HOST: "127.0.0.1", PORT: "99999" },
        expected:
          'Invalid server configuration: Invalid environment variable PORT="99999": must be an integer between 0 and 65535',
      },
      {
        env: { HOST: "127.0.0.1", PORT: "4000abc" },
        expected:
          'Invalid server configuration: Invalid environment variable PORT="4000abc": must be an integer between 0 and 65535',
      },
      {
        env: { HOST: "127.0.0.1", PORT: "" },
        expected:
          'Invalid server configuration: Invalid environment variable PORT="": must be an integer between 0 and 65535',
      },
      {
        env: { HOST: "", PORT: "0" },
        expected:
          'Invalid server configuration: Invalid environment variable HOST="": must be a non-empty hostname or IP address',
      },
    ];

    for (const testCase of cases) {
      const proc = Bun.spawn(["bun", serverPath], {
        env: createSanitizedEnv(testCase.env),
        stdout: "pipe",
        stderr: "pipe",
      });

      try {
        const exitCode = await proc.exited;
        expect(exitCode).toBe(1);

        const stderr = await new Response(proc.stderr).text();
        expect(stderr).toContain(testCase.expected);
        expect(stderr).not.toContain("ZodError");
        expect(stderr).not.toContain('"code":');
        expect(stderr).not.toContain("received NaN");
        expect(stderr).not.toContain("Too small");
      } finally {
        proc.kill();
      }
    }
  });
});
