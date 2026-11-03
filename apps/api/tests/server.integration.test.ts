import { afterEach, describe, expect, test } from "bun:test";
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
});
