import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { HealthResponseSchema } from "@devtools/core";
import { ActiveAuditJobResponseSchema } from "@devtools/lighthouse/schemas";
import { startServer } from "../src/server";

const serverPath = resolve(__dirname, "../src/server.ts");

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
    temp.stop(true);

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

  test("CLI main execution logs formatted error and exits code 1 on invalid configuration", async () => {
    const proc = Bun.spawn(["bun", serverPath], {
      env: createSanitizedEnv({
        HOST: "127.0.0.1",
        PORT: "99999",
      }),
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const exitCode = await proc.exited;
      expect(exitCode).toBe(1);

      const stderr = await new Response(proc.stderr).text();
      expect(stderr).toContain("Invalid server configuration:");
      expect(stderr).not.toContain("ZodError");
      expect(stderr).not.toContain('"code":');
    } finally {
      proc.kill();
    }
  });
});
