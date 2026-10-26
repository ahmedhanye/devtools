# CLI Tool Standards and Ergonomics

Engineering standards for command-line tools in `apps/cli`, incorporating best practices from the [Command Line Interface Guidelines (CLIG)](https://clig.dev/).

## Output streams and formatting

1. **Standard output vs. standard error**:
   - Write primary command results, tables, and requested data exclusively to `stdout`.
   - Write diagnostic messages, progress logs, informational notices, and status spinners exclusively to `stderr`.
   - This separation allows developers and automation scripts to pipe output cleanly (e.g. `devtools browser status --json | jq .`) without parsing corrupted log streams.
2. **Machine-readable output (`--json`)**:
   - Any command producing state or query data must support the `--json` flag.
   - When `--json` is supplied, write valid JSON to `stdout` and suppress all decorative banners, interactive prompts, and terminal colors.
3. **Color and terminal discipline**:
   - Respect the `NO_COLOR` environment variable; disable ANSI styling when present.
   - Detect non-TTY outputs (`!process.stdout.isTTY`). When output is piped or redirected, automatically strip terminal color escape codes.

## Flag conventions and syntax

1. **Naming and casing**:
   - Use lowercase `kebab-case` for all multi-word options and flags (e.g. `--chrome-path`, `--static-dir`, `--base-path`).
   - Positional arguments are reserved for primary nouns (e.g. `devtools browser install [channel]`). Use flags for configuration options.
2. **Standard short flags**:
   - Reserve `-h` for `--help` and `-v` for `--version`.
   - Use short flags sparingly and only for well-known parameters (e.g. `-p` for `--port`, `-d` for `--debug`).
3. **Boolean flag polarity**:
   - Prefer positive boolean flags (`--open`, `--headless`) with default values of `false`. Provide `--no-*` variants when overriding configuration defaults.

## Actionable error messages

CLI errors must guide the user directly to a resolution:

1. **Structure of an error**:
   - **What failed**: A concise statement of the immediate failure.
   - **Why it failed**: The underlying cause or missing prerequisite.
   - **How to fix it**: The exact command or remediation action the user should run.
2. **Example error output**:
   ```text
   Error: Chrome for Testing executable not found.
   Cause: No compatible Chromium browser detected in ~/.devtools/browsers/ or system PATH.
   Remediation: Run 'devtools browser install' to download and configure Chrome for Testing.
   ```
3. **Exit codes**: Exit with code `0` on successful completion. Exit with a non-zero code (`1` or specific POSIX error codes) on failure. Never exit `0` when an unhandled error occurs.

## Performance and architecture seams

1. **Instant cold-start help (`<20ms`)**:
   - Declare command metadata and flag options synchronously at registration time.
   - Avoid importing heavy modules (database engines, Chromium automation, web servers) at top-level command registration.
2. **Lazy action execution**:
   - Dynamically import heavy execution logic inside command action handlers so commands that only parse arguments or display `--help` execute instantly.
3. **Programmatic library seams**:
   - The binary entrypoint (`bin/devtools.js`) must be a minimal shebang wrapper delegating to programmatic functions:
   ```ts
   #!/usr/bin/env bun
   import { runCli } from "../src/cli";

   await runCli(process.argv);
   ```
   - Export all CLI commands and runner functions from `src/index.ts` (e.g. `runCli`, `createProgram`, `startDaemon`). This enables integration test suites to invoke CLI commands directly in-process.
   - Use Commander's `.exitOverride()` so CLI parsing errors throw rather than terminating the test runner or process abruptly.
4. **Action dependency injection and environment seams**:
   - CLI action functions should accept an optional `deps` parameter for external dependencies (e.g. browser probe functions, API clients) to allow hermetic unit testing without spawning OS subprocesses.
   - Programmatic action runners (e.g. `runWebCommand`) must expose an optional `options.env?: EnvMap` seam and delegate configuration resolution to subsystem configuration resolvers (such as `resolveDaemonConfig`) rather than reading ambient `process.env` directly. This decouples library invocations from ambient host process state.

## Daemon and signal ergonomics

1. **Unified loopback daemon**: Commands that start local services (e.g. `devtools web`) boot a single Bun HTTP daemon process serving API routes on `/api/*` and pre-rendered frontend static assets on root paths.
2. **Ephemeral port binding**: The daemon must accept `--port 0` to let the operating system assign an available port dynamically, eliminating port conflicts in test suites and local development.
3. **Graceful signal termination & database closing**: Listen for `SIGINT` and `SIGTERM` signals. When received, stop the HTTP server gracefully, drain active connections, close SQLite database handles cleanly (checkpointing WAL journals), and exit cleanly with code `0`.
