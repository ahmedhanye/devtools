# Gray-box testing playbook

Follow [the shared protocol](subagent-protocol.md) and these steps to create `<out_dir>/gray-box-testing.md`.

**Axis inspection boundary.** Audit module seams, public package interfaces, HTTP/RPC/IPC wire contracts, middleware, persistence lifecycles, integration test fidelity, architectural boundaries, and static security candidates. Leave internal branches, unit/E2E/story test-code quality, and mutation testing to White-box, and external user workflows to Black-box.

## Gray-box workflow

### 1. Map seams and contracts

Map modified boundaries across these gray-box dimensions:

- **Module seams and dependency classification:** Identify public entrypoints, injectable configuration or adapter seams, in-process collaborators, local-substitutable adapters, and external third-party boundaries.
- **Contract and schema alignment:** Confirm producers and consumers agree on validation schemas, transport methods, headers, media types, route or message formats, error envelopes, and exported signatures.
- **Persistence and state invariants:** Check schema migrations for idempotency, relational constraint enforcement across connections, transaction rollback atomicity on mid-flight errors, and cached client or singleton reconfiguration across sequential calls.
- **Error propagation and secret redaction:** Verify adapter, worker, and store errors wrap into typed domain errors preserving root causes while stripping credentials, tokens, and secrets from logs and responses.
- **Architectural and security boundaries:** Check layer dependency rules and untrusted-input guards covering host/origin validation, markup sanitization, path confinement, and safe command execution.

Completion criterion: Modified seams, contracts, persistence invariants, and security boundaries mapped.

### 2. Run integration suites and static boundary checks

Execute assigned integration suites, architecture boundary checks, migration checks, and static security scans against `TESTING.md`, `CODING_STANDARDS.md`, and `ARCHITECTURE.md`:

- Confirm integration tests cover modified seams, transport routes, migrations, and adapters under `TESTING.md` test-level separation rules.
- **Local-substitutable adapters:** Confirm integration tests exercise real in-memory databases, in-process dispatchers, or ephemeral loopback servers rather than mocking owned internal modules or patching globals when injectable seams exist.
- **Mock and fake contract fidelity:** Wherever a test uses a fake or stub at an external boundary, confirm its return shapes, status codes, and thrown error types match the real producer.
- **Security and architecture triage:** Separate real untrusted-input sinks from developer build scripts and test fixtures, and check documentation examples against exported signatures.

Completion criterion: Integration suite audit and static architecture/security triage complete, with uncovered contract edges listed.

### 3. Probe uncovered wire and state edges

Probe uncovered wire, transport, persistence, or state-lifecycle edges through the real integration seam, choosing a client that preserves the exact input under test:

- **Raw wire fidelity:** Use raw sockets or non-normalizing clients when probing spoofed `Host` or `Origin` headers, malformed percent-encoding, or raw path traversal, since high-level URL clients normalize paths and restrict headers client-side.
- **Protocol, method, and header contracts:** Probe malformed or parameterized media types, unexpected HTTP methods, boundary headers, and missing required metadata to verify status codes, diagnostic headers, and structured error envelopes.
- **Stateful connection and transaction lifecycles:** Probe sequential reconfiguration of cached connections or singletons and mid-flight error rollbacks.

Completion criterion: Uncovered contract, transport, and persistence edges probed with minimal reproductions captured.

### 4. Surface seam hints and write report

Identify any **Worth a second look** contract or seam smells (surprising status codes, leaky boundaries, fragile integration fakes, or questionable security suppressions).

Write `<out_dir>/gray-box-testing.md` per [the shared protocol](subagent-protocol.md) using these `Proven issues` categories: `Contract mismatch`, `Seam violation`, `Mock fidelity defect`, `Persistence hazard`, `Architecture violation`, `Security vulnerability`, `Missing integration test`, `Standards violation`. Return the full technical handoff to the coordinator.

Completion criterion: `<out_dir>/gray-box-testing.md` written cleanly and full handoff returned.
