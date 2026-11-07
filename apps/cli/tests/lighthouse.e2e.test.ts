import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { closeDb, createDb, runMigrations } from "@devtools/db";
import type { Server } from "bun";

const binPath = resolve(__dirname, "../bin/devtools.js");
const compiledBinPath = resolve(__dirname, "../../../dist/devtools");

describe("Lighthouse CLI Subprocess Tests (E2E)", () => {
  let server: Server<unknown>;
  let testEnv: Record<string, string>;
  let tempDir: string;
  let tempDbPath: string;
  let tempArtifactsDir: string;

  beforeAll(() => {
    tempDir = join(
      tmpdir(),
      `devtools-lh-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

    const initialDb = createDb({ path: tempDbPath });
    runMigrations(initialDb);
    closeDb();

    server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response(
          `<!DOCTYPE html>
<html>
<head><title>E2E Lighthouse Audit Test</title></head>
<body>
  <main>
    <h1>E2E Test Page</h1>
    <p>Performance audit target for Black-box CLI testing.</p>
  </main>
</body>
</html>`,
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        );
      },
    });
  });

  afterAll(() => {
    server.stop(true);
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function runSubprocess(
    cmd: string[],
    options?: Parameters<typeof Bun.spawn>[1],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const proc = Bun.spawn(cmd, {
      env: testEnv,
      stdout: "pipe",
      stderr: "pipe",
      ...options,
    });
    try {
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
        new Response(proc.stderr as ReadableStream<Uint8Array>).text(),
      ]);
      return { exitCode, stdout, stderr };
    } finally {
      proc.kill();
    }
  }

  test("lighthouse --help outputs complete CLI usage and exits 0", async () => {
    const { exitCode, stdout } = await runSubprocess([
      "bun",
      binPath,
      "lighthouse",
      "--help",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Execute Lighthouse performance audits");
    expect(stdout).toContain("--agent");
    expect(stdout).toContain("--fail-under");
    expect(stdout).toContain("list");
    expect(stdout).toContain("diff");
    expect(stdout).toContain("open");
  });

  test("lighthouse with no arguments prints usage help and exits 0", async () => {
    const { exitCode, stdout } = await runSubprocess([
      "bun",
      binPath,
      "lighthouse",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage: devtools lighthouse");
  });

  test("upfront budget validation rejects invalid rules immediately with code 1", async () => {
    const { exitCode, stdout, stderr } = await runSubprocess([
      "bun",
      binPath,
      "lighthouse",
      "https://example.com/",
      "--fail-under",
      "invalid:::rule",
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Error parsing budget rules");
    expect(stdout.trim()).toBe("");
  });

  test("executes live audit against local server with --agent, stdio separation, and persists to DB", async () => {
    const targetUrl = server.url.toString();
    const { exitCode, stdout, stderr } = await runSubprocess(
      [
        "bun",
        binPath,
        "lighthouse",
        targetUrl,
        "--agent",
        "--no-sandbox",
        "--runs",
        "1",
      ],
      {},
    );

    expect(exitCode).toBe(0);

    // Stdio separation assertions
    expect(stderr).toContain("[lighthouse]");
    expect(stderr).toContain("[complete]");

    // Clean zero-ANSI Agent Markdown on stdout
    expect(stdout).toContain(`# Lighthouse Audit: ${targetUrl}`);
    expect(stdout).toContain("## Core Web Vitals");
    expect(stdout).toContain("| LCP |");
    expect(stdout).toContain("| CLS |");
    expect(stdout).toContain("| TBT |");
    // Ensure no ANSI escape sequences leaked to stdout
    // oxlint-disable-next-line no-control-regex -- matching ANSI escape sequences
    expect(stdout).not.toMatch(/\x1b\[[0-9;]*m/);
  }, 35000);

  test("list subcommand outputs historical runs in table and JSON formats", async () => {
    // Test JSON output
    const { exitCode: jsonCode, stdout: jsonOut } = await runSubprocess([
      "bun",
      binPath,
      "lighthouse",
      "list",
      "--json",
    ]);

    expect(jsonCode).toBe(0);
    const parsed = JSON.parse(jsonOut) as Array<{ id: string; url: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    const runId = parsed[0]!.id;
    expect(runId).toBeDefined();

    // Test terminal table output
    const { exitCode: tableCode, stdout: tableOut } = await runSubprocess([
      "bun",
      binPath,
      "lighthouse",
      "list",
    ]);

    expect(tableCode).toBe(0);
    expect(tableOut).toContain("ID");
    expect(tableOut).toContain("Perf");
  });

  test("diff and open subcommands resolve persisted audit runs cleanly", async () => {
    // Fetch latest run ID from list
    const { stdout: listOut } = await runSubprocess([
      "bun",
      binPath,
      "lighthouse",
      "list",
      "--json",
    ]);
    const parsed = JSON.parse(listOut) as Array<{
      id: string;
    }>;
    const runId = parsed[0]!.id;

    // Test diff comparing run with itself
    const { exitCode: diffCode, stdout: diffOut } = await runSubprocess([
      "bun",
      binPath,
      "lighthouse",
      "diff",
      runId,
      runId,
      "--json",
    ]);

    expect(diffCode).toBe(0);
    const diffJson = JSON.parse(diffOut) as {
      baseline: { id: string };
      comparison: { id: string };
      deltas: {
        scores: Record<string, number | null>;
        metrics: Record<string, number | null>;
      };
    };
    expect(diffJson.baseline.id).toBe(runId);
    expect(diffJson.comparison.id).toBe(runId);
    expect(diffJson.deltas.scores.performanceScore).toBe(0);

    // Test open subcommand with short prefix in headless CI environment
    const prefix = runId.slice(0, 8);
    const { exitCode: openCode, stdout: openOut } = await runSubprocess([
      "bun",
      binPath,
      "lighthouse",
      "open",
      prefix,
    ]);

    expect(openCode).toBe(0);
    expect(openOut.trim()).toMatch(/^file:\/\/.*report\.html$/);
  });

  test("compiled standalone binary executes --help, list --json, and upfront validation", async () => {
    if (!existsSync(compiledBinPath)) {
      console.warn(
        "Compiled binary dist/devtools not found, skipping binary assertions",
      );
      return;
    }

    // Binary --help
    const { exitCode: helpCode, stdout: helpOut } = await runSubprocess([
      compiledBinPath,
      "lighthouse",
      "--help",
    ]);
    expect(helpCode).toBe(0);
    expect(helpOut).toContain("Execute Lighthouse performance audits");

    // Binary list --json
    const { exitCode: listCode, stdout: listOut } = await runSubprocess([
      compiledBinPath,
      "lighthouse",
      "list",
      "--json",
    ]);
    expect(listCode).toBe(0);
    expect(Array.isArray(JSON.parse(listOut))).toBe(true);

    // Binary upfront budget failure
    const { exitCode: failCode, stderr: failErr } = await runSubprocess([
      compiledBinPath,
      "lighthouse",
      "https://example.com/",
      "--fail-under",
      "bad::rule",
    ]);
    expect(failCode).toBe(1);
    expect(failErr).toContain("Error parsing budget rules");

    // Binary audit execution initializes without ENOENT virtual filesystem locales crash
    const { exitCode: auditCode, stderr: auditErr } = await runSubprocess([
      compiledBinPath,
      "lighthouse",
      "https://example.com/",
      "--runs",
      "1",
      "--chrome-path",
      "/nonexistent/chrome",
    ]);
    expect(auditCode).toBe(1);
    expect(auditErr).not.toContain("scandir '/$bunfs/root/locales/'");
    expect(auditErr).toContain(
      'Specified browser path is invalid or non-executable: "/nonexistent/chrome"',
    );
  });
});
