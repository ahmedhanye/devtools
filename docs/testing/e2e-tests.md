# End-to-end testing

Guidelines and patterns for writing black-box end-to-end tests (`*.e2e.test.ts` via `test:e2e`) that verify CLI executables (`apps/cli/bin/devtools.js`), signal handling, stream routing, and full-stack daemon delivery via `Bun.spawn`. See [`TESTING.md`](../../TESTING.md) and [`box-testing.md`](box-testing.md) for workspace mappings.

## 1. CLI subprocess execution with `Bun.spawn`

Verify command-line flags, exit codes, `stdout` vs `stderr` stream separation, and `--json` output schemas:

```ts
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import pkg from "../../../package.json";

const binPath = resolve(import.meta.dir, "../bin/devtools.js");

describe("CLI binary end-to-end contract", () => {
  it("prints package version to stdout and exits 0 on --version", async () => {
    const proc = Bun.spawn(["bun", binPath, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe(pkg.version);
      expect(stderr).toBe("");
    } finally {
      proc.kill();
    }
  });

  it("writes diagnostic error to stderr and exits 1 on invalid port flag", async () => {
    const proc = Bun.spawn(["bun", binPath, "web", "--port", "99999"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      expect(exitCode).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toContain("Invalid port");
    } finally {
      proc.kill();
    }
  });
});
```

## 2. Full-stack daemon E2E flow (`CLI`, `Daemon`, `UI`, and `API`)

Boot the CLI daemon on an ephemeral port (`getEphemeralPort()` / `getFreePort()` from `apps/cli/tests/support/network.ts`), wait for readiness, verify static Next.js UI asset delivery alongside `/api/*` JSON contracts, and verify graceful signal shutdown (`SIGTERM` / `SIGINT`):

```ts
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { ApiErrorResponseSchema, HealthResponseSchema } from "@devtools/core";
import { getEphemeralPort, waitForServer } from "./support/network";

const binPath = resolve(import.meta.dir, "../bin/devtools.js");

describe("Full-stack CLI web daemon E2E", () => {
  it("serves static UI, routes /api/health, and exits 0 on SIGTERM", async () => {
    const port = getEphemeralPort();
    const proc = Bun.spawn(
      ["bun", binPath, "web", "--port", String(port), "--host", "127.0.0.1"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const isUp = await waitForServer(port, "127.0.0.1");
      expect(isUp).toBe(true);

      const baseUrl = `http://127.0.0.1:${port}`;

      const indexRes = await fetch(`${baseUrl}/`);
      expect(indexRes.status).toBe(200);
      expect(await indexRes.text()).toContain("<!DOCTYPE html>");

      const healthRes = await fetch(`${baseUrl}/api/health`);
      expect(healthRes.status).toBe(200);
      expect(HealthResponseSchema.parse(await healthRes.json()).status).toBe(
        "ok",
      );

      const missingApiRes = await fetch(`${baseUrl}/api/unknown`);
      expect(missingApiRes.status).toBe(404);
      expect(
        ApiErrorResponseSchema.parse(await missingApiRes.json()).error.code,
      ).toBe("NOT_FOUND");

      proc.kill("SIGTERM");
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
    }
  });
});
```

## Subprocess testing rules

1. **Always kill child processes in `finally`.** Wrap every `Bun.spawn` call in a `try ... finally` block calling `proc.kill()` so failed assertions never leak orphan daemon processes or hold ports open.
2. **Enforce CLIG stream separation.**
   - Assert that command results, URLs, and `--json` payloads print to `stdout` without ANSI escape codes when `--json` or `NO_COLOR=1` is set.
   - Assert that startup logs, shutdown notices (`Received SIGTERM`), and error diagnostics print to `stderr`.
3. **Verify exit code contracts.**
   - `0` on normal completion or clean `SIGTERM` / `SIGINT` daemon shutdown.
   - `1` on invalid CLI flags, schema validation errors, or occupied ports.
   - `130` when an interactive or foreground command is interrupted by `SIGINT` where applicable.
4. **Isolate filesystem side effects.** When testing commands that cache browser binaries or write SQLite files (such as `devtools web` or `devtools browser`), pass `DEVTOOLS_DB_PATH: ":memory:"` or a temporary directory created with `fs.mkdtempSync(join(tmpdir(), "devtools-e2e-"))` via flags or `env` overrides so subprocesses never create or mutate `.devtools/devtools.db`, and remove temporary directories with `fs.rmSync(tempDir, { recursive: true, force: true })` in `finally`.
