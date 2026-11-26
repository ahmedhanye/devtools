import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openDb } from "@devtools/db";
import { createLighthouseStore } from "@devtools/lighthouse";

const binPath = resolve(__dirname, "../bin/devtools.js");

describe("Lighthouse CLI Signal Cancellation Tests (E2E)", () => {
  let testEnv: Record<string, string>;
  let tempDir: string;
  let tempDbPath: string;
  let tempArtifactsDir: string;

  beforeAll(() => {
    tempDir = join(
      tmpdir(),
      `devtools-lh-cancel-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    tempDbPath = join(tempDir, "test.sqlite");
    tempArtifactsDir = join(tempDir, "artifacts");
    mkdirSync(tempArtifactsDir, { recursive: true });

    testEnv = {
      ...(process.env as Record<string, string>),
      DEVTOOLS_DB_PATH: tempDbPath,
      DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR: tempArtifactsDir,
      CI: "true",
      NO_COLOR: "1",
    };
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function assertMidAuditSignalCancellation(
    signal: "SIGTERM" | "SIGINT",
    expectedExitCode: number,
  ): Promise<void> {
    const slowPath = `/slow-cancel-${signal.toLowerCase()}`;
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
      [
        "bun",
        binPath,
        "lighthouse",
        `http://127.0.0.1:${slowServer.port}${slowPath}`,
        "--no-sandbox",
        "--runs",
        "1",
      ],
      {
        env: testEnv,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let stderrSoFar = "";
      let signaled = false;
      const deadline = Date.now() + 20000;
      let pendingRead = reader.read();

      try {
        while (Date.now() < deadline) {
          const raced = await Promise.race([
            pendingRead.then((chunk) => ({ kind: "read" as const, chunk })),
            Bun.sleep(100).then(() => ({ kind: "tick" as const })),
          ]);
          if (raced.kind === "read") {
            if (raced.chunk.done) {
              stderrSoFar += decoder.decode();
              break;
            }
            stderrSoFar += decoder.decode(raced.chunk.value, { stream: true });
            if (!signaled && stderrSoFar.includes("[navigating]")) {
              signaled = true;
              expect(stderrSoFar).toContain("[launching_browser]");
              proc.kill(signal);
            }
            pendingRead = reader.read();
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }

      expect(signaled).toBe(true);
      const exitCode = await proc.exited;
      expect(exitCode).toBe(expectedExitCode);
      expect(stderrSoFar).toContain(`Received ${signal}. Shutting down...`);

      using db = openDb({ path: tempDbPath });
      const store = createLighthouseStore({
        db,
        artifactsDir: tempArtifactsDir,
      });
      const matchingRuns = store
        .listRuns()
        .filter((r) => r.url.includes(slowPath));
      expect(matchingRuns).toHaveLength(0);
    } finally {
      if (proc.exitCode === null) {
        proc.kill("SIGKILL");
      }
      await slowServer.stop(true);
    }
  }

  test("cancels mid-audit SIGTERM cleanly, exits 143, and persists zero run rows", async () => {
    await assertMidAuditSignalCancellation("SIGTERM", 143);
  }, 35000);

  test("cancels mid-audit SIGINT cleanly, exits 130, and persists zero run rows", async () => {
    await assertMidAuditSignalCancellation("SIGINT", 130);
  }, 35000);
});
