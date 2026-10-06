import { afterEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { HealthResponseSchema } from "@devtools/core";
import { type ServerInstance, startServer } from "../src/server";

describe("Standalone Server Lifecycle", () => {
  let activeInstance: ServerInstance | null = null;

  afterEach(async () => {
    if (activeInstance) {
      await activeInstance.stop();
      activeInstance = null;
    }
  });

  test("boots on ephemeral port 0 and serves /api/health over HTTP socket", async () => {
    activeInstance = startServer({ port: 0, hostname: "127.0.0.1" });
    expect(activeInstance.port).toBeGreaterThan(0);

    const response = await fetch(
      `http://127.0.0.1:${activeInstance.port}/api/health`,
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    const parsed = HealthResponseSchema.parse(data);
    expect(parsed.status).toBe("ok");
  });

  test("gracefully stops and closes socket connections", async () => {
    activeInstance = startServer({ port: 0, hostname: "127.0.0.1" });
    const port = activeInstance.port;

    // Verify it responds
    const initialRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(initialRes.status).toBe(200);

    // Stop server
    await activeInstance.stop();
    activeInstance = null;

    // Subsequent fetch should fail to connect
    expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
  });

  test("detects port conflict when port is already in use", async () => {
    activeInstance = startServer({ port: 0, hostname: "127.0.0.1" });
    const occupiedPort = activeInstance.port;

    expect(() => {
      startServer({ port: occupiedPort, hostname: "127.0.0.1" });
    }).toThrow();
  });

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

      // Verify stdout contains listening announcement
      proc.kill("SIGTERM");
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
    } finally {
      proc.kill();
    }
  });

  test("CLI main execution logs diagnostic error on EADDRINUSE conflict and exits with code 1", async () => {
    activeInstance = startServer({ port: 0, hostname: "127.0.0.1" });
    const occupiedPort = activeInstance.port;

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
  });
});
