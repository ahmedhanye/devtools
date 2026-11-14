# Runtime & CLI Context

Domain terms for the DevTools runtime stack, local daemon, and standalone distribution.

## Language

**Daemon**:
The single local Bun process hosting API routes and compiled frontend static assets on one loopback port.
_Avoid_: Unified loopback daemon, background server, host process, separate API daemon, reverse proxy setup

**Runtime Stack**:
The interconnected pipeline linking CLI commands, the local Daemon, API routes, and the static web dashboard.
_Avoid_: Application stack, architecture stack, platform

**Shared Core**:
The central zero-dependency package providing shared domain schemas, types, and error primitives across workspaces.
_Avoid_: Common library, shared utils, base package

**Checksum Manifest**:
The cryptographic digest document recording verification hashes of compiled release artifacts.
_Avoid_: Hash list, verification file, signature manifest

**Host Process Boundary**:
The outermost operating system process entrypoint where ambient environment variables, arguments, signals, and terminal streams enter before conversion into domain configuration.
_Avoid_: Outer shell, process wrapper, main thread

**Programmatic CLI Seam**:
The exported library interface decoupled from the executable wrapper so callers and tests can invoke commands in-process.
_Avoid_: CLI export, programmatic wrapper, script hook
