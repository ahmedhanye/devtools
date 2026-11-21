# CLI tool standards and ergonomics

Authoring conventions for command-line tools in `apps/cli`, following the [Command Line Interface Guidelines (CLIG)](https://clig.dev/). For CLI module layout, Daemon lifecycle, and binary compilation, see [CLI and Daemon architecture](../architecture/cli-and-daemon.md).

## Output streams and formatting

- **Separate `stdout` and `stderr`.** Write requested data, tables, and JSON payloads to `stdout`. Write logs, progress messages, spinners, and error diagnostics to `stderr` so output pipes cleanly (`devtools browser status --json | jq .`).
- **Machine-readable `--json`.** Every query or status command supports `--json`, emitting valid JSON to `stdout` with banners, prompts, and ANSI styling suppressed.
- **Color and TTY discipline.** Use helpers in `apps/cli/src/shared/terminal/colors.ts`: disable ANSI escape codes when `NO_COLOR` is set and non-empty, honor `FORCE_COLOR` (unless `"0"` or `"false"`) even on non-TTY streams, and otherwise enable color only on interactive TTYs when `TERM !== "dumb"` (pass `colors: false` explicitly when unconditional suppression is required).

## Flag conventions

- **Kebab-case options.** Use lowercase `kebab-case` for multi-word flags (`--chrome-path`, `--static-dir`, `--fail-under`). Reserve positional arguments for primary nouns (`devtools lighthouse [url]`).
- **Standard short flags.** Reserve `-h` for `--help` and `-V` for `--version` (Commander default in `apps/cli/src/app/program.ts`). Add short flags sparingly for common parameters (`-p` for `--port`, `-H` for `--host`, `-s` for `--static-dir`).
- **Positive boolean polarity.** Prefer positive flags (`--open`, `--headless`) defaulting to `false`, adding `--no-*` only to override true defaults.

## Actionable error messages

Format CLI failures with three explicit parts so users know how to recover immediately:

```text
Error: Chrome for Testing executable not found.
Cause: No compatible Chromium browser detected in ~/.devtools/browsers/ or system PATH.
Remediation: Run 'devtools browser install' to download and configure Chrome for Testing.
```

Exit `0` on success or clean signal shutdown, and non-zero (`1`, or `130` / `143` on signal interrupt) on failure. Never exit `0` after an unhandled error.

## Performance and Programmatic CLI Seams

- **Fast `--help` cold start (`<20ms`).** Register command metadata synchronously in `apps/cli/src/app/program.ts` and dynamically import `@devtools/db`, `@devtools/lighthouse`, `@devtools/browser`, and daemon modules only inside action handlers or lazy store loaders so `--help`, `--version`, and `browser status` load zero SQLite modules.
- **Minimal binary wrapper.** Keep `apps/cli/bin/devtools.js` as a 4-line shebang delegating to `executeCliMain(import.meta.main)` in `apps/cli/src/app/main.ts`.
- **Testable seams.** Re-export `createProgram`, `runCli`, and `startDaemon` from `apps/cli/src/index.ts`, use Commander `.exitOverride()` in programmatic runners, and accept optional `options.env?: EnvMap` Configuration Seams and `deps` parameters on command runners (`runWebCommand`, `runBrowserStatusCommand`, `runLighthouseAuditCommand`) instead of reading ambient `process.env`.

## Daemon and signal ergonomics

- Support `--port 0` on local service commands for OS-assigned ephemeral ports.
- Handle `SIGINT` and `SIGTERM` exclusively through per-instance `createTeardown()` scopes and `attachHostSignals` from `@devtools/core/node` per [Scoped LIFO teardown](../architecture/cli-and-daemon.md#scoped-lifo-teardown).
- Always run `ctx.closeStore()` inside `finally` before calling `ctx.exit()` in Lighthouse commands so database handles close cleanly before process exit, and suppress `exit(1)` on aborted cancel signals (`ExitPromptError` or `signal.aborted`) so `main.ts` exits `130`.
