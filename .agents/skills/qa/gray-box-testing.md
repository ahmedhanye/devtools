# Gray-box testing playbook

Playbook for the gray-box QA subagent. Follow the **Shared subagent protocol** in [`SKILL.md`](SKILL.md) alongside the gray-box rules below to create `.scratch/qa/<timestamp>-<slug>/gray-box-testing.md`.

**Axis inspection boundary.** Audit module seams, public package interfaces, HTTP and RPC wire contracts, middleware and static-asset boundaries, database persistence lifecycles, error propagation, security candidates, and architectural layer rules paired with `*.integration.*` suites. Always test and probe through module entrypoints and local-substitutable integration seams (in-process HTTP `request()` dispatchers, ephemeral loopback servers, in-memory databases) rather than calling internal validator helpers directly (White-box) or duplicating external CLI binary checks (Black-box).

## Gray-box workflow

### 1. Map seams and contracts

Map modified boundaries across five gray-box dimensions:

- **Module seams and dependency classification.** Identify public entrypoints, injectable configuration or adapter seams, in-process collaborators, local-substitutable adapters (in-memory databases, socketless HTTP dispatchers, ephemeral loopback servers), and external third-party boundaries.
- **Contract and schema alignment.** Check that producer and consumer modules agree on validation schemas, HTTP methods, route paths, headers (`Host`, `Origin`, `Sec-Fetch-Site`, `Content-Type`), query parameters, error response envelopes, and exported API signatures.
- **Persistence and state invariants.** Check database migrations for idempotency, foreign key and cascade enforcement, transaction rollback atomicity on mid-flight errors, and stateful singleton or cache lifecycles across sequential reconfiguration.
- **Error propagation and secret redaction.** Verify that low-level adapter, worker, or database failures wrap into typed domain errors preserving error context (`cause`) and redact tokens, credentials, and secrets from logs and error payloads.
- **Architectural and security boundaries.** Check module dependency direction and runtime security boundaries (loopback host and origin validation, markup sanitization, static path traversal guards, and command execution arguments).

### 2. Audit assigned integration suites, linters, and security scans

Audit assigned integration tests and static scan outputs against repository testing standards:

- Confirm integration tests exist for modified seams, routes, migrations, and adapters and follow repository file-naming and level-separation rules.
- **Local-substitutable adapter usage.** Confirm tests exercise real in-memory databases, socketless HTTP dispatchers, or ephemeral loopback servers (`port: 0`) rather than mocking owned modules, spying on internal module exports, or applying process-global module patches when function/component seams exist.
- **Mock and fake contract fidelity.** Wherever a test uses a fake or stub at an external boundary, confirm its return shapes, status codes, and thrown error classes match what the real producer module emits.
- **Security and architecture triage.** Separate real runtime sinks (unsanitized markup injection, unvalidated headers, path traversals) from developer build scripts or test fixtures, and check documentation code examples against exported signatures.

### 3. Probe uncovered contract, wire, and persistence edges

Identify and probe contract, HTTP middleware, static-asset wire, migration, or state-lifecycle edges missing from passing `*.integration.*` suites through the integration seam (`request()`, loopback socket/fetch, or in-memory database):

- **HTTP header and media-type contracts.** Loopback `Host` and `Origin` permutations (including IPv6 `[::1]`, non-numeric ports, missing `Host` headers, and spoofed subdomains), parameterized `Content-Type` headers (`application/json; charset=utf-8`), and disallowed mutating HTTP methods.
- **Raw wire URI and path traversal guards.** Malformed percent-encoding (`/%E0%A4%A`, `/%ZZ`) and single or double-encoded path traversal (`/%2e%2e/`, `/%252e%252e/`) dispatched through the HTTP router or static-asset server.
- **Stateful connection and transaction lifecycles.** Sequential reconfiguration of cached database or client singletons across path, environment, and custom connection options, plus mid-transaction rollback atomicity.

### 4. Write report

Verify uncertain findings per shared protocol, then write `.scratch/qa/<timestamp>-<slug>/gray-box-testing.md` using the Section 4 categories: `Contract mismatch`, `Seam/mock violation`, `Persistence hazard`, `Architecture/security violation`, `Missing integration test`, or `Standards violation`.
