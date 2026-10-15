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

### Issue and tracking hierarchy

**Spec**:
A capability specification that tracks milestone completion and decomposes into child tickets.
_Avoid_: Epic, feature initiative, milestone goal, parent issue

**Ticket**:
An atomic vertical slice issue that delivers end-to-end functionality in a single pull request, either standalone or linked to a parent Spec as a native sub-issue.
_Avoid_: Sub-task, story, work item, task issue
