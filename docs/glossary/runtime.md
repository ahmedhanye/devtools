# Runtime & CLI Context

Domain terms for the DevTools runtime stack, local daemon, and standalone executable distribution.

## Language

**Daemon**:
The single production Bun process that serves compiled frontend static assets and routes API requests in-process on a single port.
_Avoid_: Background server, host process, runner daemon

**Runtime Stack**:
The interconnected pipeline linking CLI commands, local daemon, Hono API routes, and Next.js static frontend.
_Avoid_: Application stack, architecture stack, platform

**Shared Core**:
The `@devtools/core` package providing domain schemas, types, and error definitions used across multiple packages.
_Avoid_: Common library, shared utils, base package

**Standalone Executable**:
A self-contained single-file binary produced by `bun build --compile` embedding the Bun engine, entrypoint bytecode, and dependencies.
_Avoid_: Native binary, compiled bundle, distribution build

**Checksum Manifest**:
The cryptographic checksum document (`SHA256SUMS.txt`) recording SHA256 hashes of compiled standalone executables attached to a GitHub release.
_Avoid_: Hash list, verification file, signature manifest

**Host Process Boundary**:
The outermost operating system process entrypoint (`bin/devtools.js`, shell signals, TTY stdin/stdout) where ambient `process.env` and `process.argv` are received from the host environment before conversion into domain configuration.
_Avoid_: Outer shell, process wrapper, main thread

**Environment Seam**:
An optional configuration parameter (`options.env?: Record<string, string | undefined>`) that allows functions and services to resolve environment variables without accessing the global `process.env` singleton, ensuring hermetic test isolation.
_Avoid_: Env override, env injector, process seam

**Unified Loopback Daemon**:
The single Bun process hosting Hono API routes (`/api/*`) and serving compiled Next.js frontend static assets on a single loopback port.
_Avoid_: Multi-server architecture, separate API daemon, reverse proxy setup

**Command Line Interface Guidelines (CLIG)**:
The ergonomic design principles governing CLI stream separation (`stdout` vs `stderr`), `--json` formatting, `NO_COLOR` compliance, and actionable error messages.
_Avoid_: CLI style guide, shell conventions, console rules

**Programmatic CLI Seam**:
The exported library interface (`runCli`, `startDaemon`, `createProgram`) decoupled from the executable binary wrapper, allowing in-process test execution.
_Avoid_: CLI export, programmatic wrapper, script hook

**Direct Source Export**:
Internal monorepo package configuration (`"exports": "./src/index.ts"`) enabling consuming workspaces to resolve TypeScript sources directly without build artifacts.
_Avoid_: Source mapping, development export, direct import
