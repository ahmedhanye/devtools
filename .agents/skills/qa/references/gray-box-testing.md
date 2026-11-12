# Gray-box testing playbook

Follow [the shared protocol](subagent-protocol.md) and these steps to create `<out_dir>/gray-box-testing.md`.

**Axis inspection boundary.** Audit module seams, public package interfaces, HTTP, RPC, or IPC wire contracts, middleware, persistence lifecycles, error propagation, static security candidates, and architectural layer boundaries paired with integration suites. Test through exported interfaces and local-substitutable adapters while leaving internal branches and mutation tracing to White-box and external binary or workflow checks to Black-box.

## Gray-box workflow

### 1. Map seams and contracts

Map modified boundaries across these gray-box dimensions:

- **Module seams and dependency classification.** Identify public entrypoints, injectable configuration or adapter seams, in-process collaborators, local-substitutable adapters, and external third-party boundaries.
- **Contract and schema alignment.** Confirm producers and consumers agree on validation schemas, transport methods, headers, media types, route or message formats, error envelopes, and exported signatures.
- **Persistence and state invariants.** Check schema migrations for idempotency, relational constraint enforcement across connections, transaction rollback atomicity on mid-flight errors, and cached client or singleton reconfiguration across sequential calls.
- **Error propagation and secret redaction.** Verify adapter, worker, and store errors wrap into typed domain errors preserving root causes while stripping credentials, tokens, and secrets from logs and responses.
- **Architectural and security boundaries.** Check layer dependency rules and untrusted-input guards covering host and origin validation, markup sanitization, path confinement, and safe command execution.

Completion criterion: Modified seams, contracts, persistence invariants, and security boundaries mapped.

### 2. Audit assigned integration suites, linters, and security scans

Review integration suites and architectural or security scan results against repository testing guides:

- Confirm integration tests cover modified seams, transport routes, migrations, and adapters under repository naming and test-level separation rules.
- **Local-substitutable adapter usage.** Confirm integration tests exercise real in-memory databases, in-process dispatchers, or ephemeral loopback servers rather than mocking owned internal modules, spying on private helpers, or patching globals when injectable seams exist.
- **Mock and fake contract fidelity.** Wherever a test uses a fake or stub at an external boundary, confirm its return shapes, status codes, and thrown error types match the real producer.
- **Architecture, security, and example triage.** Separate real untrusted-input sinks from developer build scripts and test fixtures, and check documentation examples against exported signatures.

Completion criterion: Integration suite audit and static architecture and security triage complete, with uncovered contract edges listed.

### 3. Probe uncovered contract, wire, and state edges

Probe uncovered wire, transport, persistence, or state-lifecycle edges through the real integration seam, choosing a client that preserves the exact input under test:

- **Raw wire fidelity.** High-level HTTP and URL clients often normalize single-encoded dot segments and forbid or overwrite restricted headers such as `Host` or `Origin`. When testing network protocols, spoofed headers, malformed percent-encoding, or raw path traversal, use raw sockets or non-normalizing clients alongside standard in-process or loopback requests for payload and media-type logic.
- **Protocol, method, and header contracts.** Probe malformed or parameterized media types, unexpected methods, boundary headers, and missing required metadata to verify status codes, diagnostic headers, and structured error envelopes match documented specifications.
- **Stateful connection and transaction lifecycles.** Probe sequential reconfiguration of cached connections or singletons across distinct configurations and mid-flight error rollbacks.

Completion criterion: Uncovered contract, transport, and persistence edges probed with minimal reproductions captured for any failures.

### 4. Write report

Verify uncertain findings per [the shared protocol](subagent-protocol.md), then write `<out_dir>/gray-box-testing.md` using these Section 4 categories: `Contract mismatch`, `Seam violation`, `Mock fidelity defect`, `Persistence hazard`, `Architecture violation`, `Security vulnerability`, `Missing integration test`, or `Standards violation`.

Completion criterion: `<out_dir>/gray-box-testing.md` written and completion confirmation sent to the coordinator.
