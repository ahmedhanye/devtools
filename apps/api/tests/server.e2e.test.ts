import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { startServer } from "../src/server";

describe("Standalone Server CLI Subprocess Lifecycle", () => {
  test("CLI main execution boots server and exits gracefully on SIGTERM", async () => {
    const serverPath = resolve(__dirname, "../src/server.ts");
    // Find an open port by temporarily binding
    const temp = Bun.serve({
      port: 0,
      fetch() {
        return new Response();
      },
    });
    const freePort = temp.port;
    temp.stop(true);

    const proc = Bun.spawn(["bun", serverPath], {
      env: { ...process.env, PORT: String(freePort) },
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      // Wait for server to start by polling endpoint
      let ready = false;
      for (let i = 0; i < 20; i++) {
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

      // Verify stdout contains listening announcement and shutdown message
      proc.kill("SIGTERM");
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);

      const stdout = await new Response(proc.stdout).text();
      expect(stdout).toContain("Server listening on http://");
      expect(stdout).toContain("Shutting down server...");
    } finally {
      proc.kill();
    }
  });

  test("CLI main execution logs diagnostic error on EADDRINUSE conflict and exits with code 1", async () => {
    const activeInstance = startServer({ port: 0, hostname: "127.0.0.1" });
    const occupiedPort = activeInstance.port;

    try {
      const serverPath = resolve(__dirname, "../src/server.ts");
      const proc = Bun.spawn(["bun", serverPath], {
        env: { ...process.env, PORT: String(occupiedPort) },
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      expect(exitCode).toBe(1);

      const stderr = await new Response(proc.stderr).text();
      expect(stderr).toContain(
        `Port ${occupiedPort} is already in use. Set PORT=<port> to use an alternate port.`,
      );
    } finally {
      await activeInstance.stop();
    }
  });

  test("CLI main execution logs formatted error and exits code 1 on invalid configuration", async () => {
    const serverPath = resolve(__dirname, "../src/server.ts");
    const proc = Bun.spawn(["bun", serverPath], {
      env: { ...process.env, PORT: "99999" },
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);

    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain("Invalid server configuration:");
    expect(stderr).not.toContain("ZodError");
    expect(stderr).not.toContain('"code":');
  });
});
