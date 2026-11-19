# End-to-end testing

Patterns for authoring black-box end-to-end tests (`*.e2e.test.ts` via `test:e2e`) verifying CLI executables (`apps/cli/bin/devtools.js`), `stdout`/`stderr` separation, signal teardown, and full-stack Daemon delivery via `Bun.spawn`. See [`TESTING.md`](../../TESTING.md) and [`box-testing.md`](box-testing.md) for workspace mappings.

## Subprocess execution pattern (`Bun.spawn`)

Always bind an ephemeral port (`getFreePort` / `waitForServer` in `apps/cli/tests/support/network.ts`), sanitize environment variables (`DEVTOOLS_DB_PATH: ":memory:"` or a temp directory), and kill the child process in `finally`:

```ts
const proc = Bun.spawn(["bun", binPath, "web", "--port", String(port)], {
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env, DEVTOOLS_DB_PATH: ":memory:" },
});
try {
  expect(await waitForServer(port, "127.0.0.1")).toBe(true);
  // Assert static UI delivery, /api/* Zod contracts, and clean SIGTERM teardown
  proc.kill("SIGTERM");
  expect(await proc.exited).toBe(0);
} finally {
  proc.kill();
}
```

- **Reference suites:** `apps/cli/tests/cli.e2e.test.ts`, `apps/cli/tests/browser.e2e.test.ts`, `apps/cli/tests/lighthouse.e2e.test.ts`, `apps/api/tests/server.e2e.test.ts`, `packages/lighthouse/tests/runner.e2e.test.ts`.

## Subprocess testing rules

1. **Always terminate child processes in `finally`.** Wrap every `Bun.spawn` call in `try ... finally { proc.kill(); }` so failed assertions never leak orphan Daemon processes or open ports.
2. **Enforce CLIG stream separation.** Assert command data, URLs, and `--json` payloads write to `stdout` without ANSI codes under `--json` or `NO_COLOR=1`, while startup logs, shutdown notices, and errors write to `stderr`.
3. **Isolate filesystem side effects.** Pass `DEVTOOLS_DB_PATH: ":memory:"` or an isolated `fs.mkdtempSync(join(tmpdir(), "devtools-e2e-"))` directory via flags or `env` overrides so subprocesses never create or mutate `.devtools/devtools.db`, removing temporary directories with `fs.rmSync(tempDir, { recursive: true, force: true })` in `finally`.

## Exit code contracts

| Exit code | Expected condition                                                              |
| :-------: | :------------------------------------------------------------------------------ |
|    `0`    | Normal completion or clean `SIGTERM` / `SIGINT` Daemon shutdown.                |
|    `1`    | Invalid CLI flags, schema validation errors, occupied ports, or runtime errors. |
|   `130`   | Interactive or foreground command interrupted by `SIGINT` (where applicable).   |
