---
status: accepted
date: 2026-11-14
supersedes: ADR-0003 (execution isolation)
---

# In-process Lighthouse execution

`@devtools/lighthouse` executes Audit Runs directly in-process with `AbortSignal` cancellation and Chromium cleanup on ephemeral ports, leaving multi-request job concurrency and background isolation to application boundaries.

## Considered options

- **Subprocess worker script (`Bun.spawn`, [ADR 0003](0003-lighthouse-audit-isolation-and-tiered-storage.md)):** Rejected after compiled-binary testing showed that `process.execPath` inside `bun build --compile` binaries points to the compiled binary rather than a `bun` interpreter, the virtual filesystem omits loose TypeScript files, and child OS processes cannot share `:memory:` SQLite test databases.

## Consequences

- Standalone compiled binaries run Lighthouse audits with zero external runtime dependencies, and headless packages stay pure domain libraries instead of process orchestrators; see [Performance auditing architecture](../architecture/lighthouse.md) and [ADR 0004](0004-lighthouse-daemon-api-isolation-and-sse.md) for cancellation and job concurrency.
