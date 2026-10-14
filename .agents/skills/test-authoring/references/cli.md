# CLI and daemon application testing

Testing contracts and patterns for `apps/cli` (`@devtools/cli`).

- **Runner**: `bun:test`
- **Scope**: Commander flag parsing, daemon process lifecycle, static file serving, subprocess lifecycle.

## Patterns

1. **Flag precedence**: Test that CLI argument flags override environment variables, and environment variables override default configuration values.
2. **Ephemeral port binding**: In integration tests (`daemon.test.ts`), bind `startDaemon({ port: 0 })` to obtain an operating-system-assigned port, preventing port collisions across concurrent test runs.
3. **Static serving and route guards**: Verify static asset delivery, confirm path traversal attempts (`../`) return HTTP 403, and confirm unsupported HTTP methods return HTTP 405.
4. **Subprocess lifecycle and signals**: In end-to-end CLI tests (`cli.test.ts`), spawn processes with `Bun.spawn`. Poll readiness endpoint until available, dispatch signals (`SIGTERM`, `SIGINT`), and assert exit code 0.
5. **Conflict handling**: Verify the CLI exits with non-zero status codes on invalid directories or occupied ports.

## Example

```ts
import { describe, expect, it } from "bun:test";
import { startDaemon } from "../src/daemon";

describe("Daemon lifecycle integration", () => {
  it("binds to ephemeral port 0 and serves health endpoint", async () => {
    const daemon = await startDaemon({ port: 0, host: "127.0.0.1" });
    const port = daemon.port;
    expect(port).toBeGreaterThan(0);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);

    await daemon.stop();
  });

  it("blocks path traversal attempts on static file routes", async () => {
    const daemon = await startDaemon({ port: 0, host: "127.0.0.1" });
    const port = daemon.port;

    const res = await fetch(`http://127.0.0.1:${port}/static/../../etc/passwd`);
    expect(res.status).toBe(403);

    await daemon.stop();
  });
});

describe("Subprocess CLI signal handling", () => {
  it("terminates cleanly with code 0 on SIGTERM", async () => {
    const proc = Bun.spawn(["bun", "run", "./bin/devtools.js", "daemon", "--port", "0"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Allow process to initialize, then send signal
    proc.kill("SIGTERM");
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});
```
