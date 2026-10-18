# DevTools

Developer tooling monorepo providing development utilities and workflows across CLI, daemon, API, and frontend interfaces.

## Language

### System and runtime architecture

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
The cryptographic verification file (`SHA256SUMS.txt`) documenting SHA256 hashes of compiled standalone executables attached to a GitHub release.
_Avoid_: Hash list, verification file, signature manifest

### Verification and review workflows

**Local Verification Gate**:
The change-scoped automated test, lint, typecheck, and formatting checks executed before committing, pushing, or opening a pull request.
_Avoid_: Pre-PR gate, full quality gate, verification pipeline, CI suite

**Manual Verification Checklist**:
An interactive, step-by-step test procedure executed in a browser or terminal to verify sensory behavior, visual presentation, and user flows.
_Avoid_: QA checklist, testing checklist, manual test plan

**Developer Review Guide**:
A structural summary of architecture decisions, state logic, and test coverage provided to help developers understand changes without reading raw diffs.
_Avoid_: Code review checklist, technical QA, implementation review

**Runner Egress Allowlist**:
The explicit, job-scoped set of approved destination hostnames and ports configured on StepSecurity Harden-Runner in block mode to prevent unauthorized outbound network telemetry or credential exfiltration.
_Avoid_: Firewall whitelist, network rules, proxy allowlist, runner sandbox filter

### Issue and tracking hierarchy

**Spec**:
A capability specification that tracks milestone completion and decomposes into child tickets.
_Avoid_: Epic, feature initiative, milestone goal, parent issue

**Ticket**:
An atomic vertical slice issue that delivers end-to-end functionality in a single pull request, either standalone or linked to a parent Spec as a native sub-issue.
_Avoid_: Sub-task, story, work item, task issue

### Browser and audit infrastructure

**Browser Resolution Waterfall**:
The strict 3-tier precedence algorithm (explicit flag/env → managed cache & system probes → terminal remediation stop) that resolves a Chromium binary.
_Avoid_: Browser detection chain, chrome locator pipeline, browser discovery fallback

**Managed Browser Cache**:
The centralized directory (`~/.devtools/browsers/`) hosting downloaded Chrome for Testing binaries across all local devtools workspaces.
_Avoid_: Download cache, browser store, local chromium dir

**Chrome for Testing (CfT)**:
Google's dedicated, telemetry-free Chromium distribution specifically engineered for automated testing, distributed as `chrome-headless-shell` and `chrome`.
_Avoid_: Test chromium, headless chrome binary, puppeteer browser

**Explicit Browser Override**:
A developer-supplied binary path provided via the `--chrome-path` CLI option or the `DEVTOOLS_CHROME_PATH` / `CHROME_PATH` environment variables that bypasses auto-detection.
_Avoid_: Custom chrome binary, manual browser path, chrome flag

**Managed Cache Override**:
A custom filesystem directory designated via `--path` or `DEVTOOLS_BROWSERS_DIR` that replaces the default `~/.devtools/browsers/` location for downloaded Chrome for Testing binaries.
_Avoid_: Custom download dir, browser store path, alternate cache location
