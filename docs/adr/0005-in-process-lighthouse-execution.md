---
status: accepted
date: 2026-11-14
supersedes: ADR-0003 (execution isolation)
contexts:
  - Performance Auditing
  - Runtime & CLI
---

# In-process Lighthouse execution

`packages/lighthouse` executes audit iterations directly in-process with `AbortSignal` cancellation and deterministic Chromium teardown on ephemeral ports, leaving multi-request job concurrency and background isolation to application boundaries (`apps/api`).

## Considered options

- **Subprocess worker script (`worker.ts` via `Bun.spawn`, [ADR 0003](0003-lighthouse-audit-isolation-and-tiered-storage.md)):** Rejected after `2026-11-06` compiled-binary testing showed that `process.execPath` inside `bun build --compile` binaries points to the compiled binary rather than a `bun` interpreter, the virtual filesystem omits loose TypeScript files, and child OS processes cannot share `:memory:` SQLite test handles.

## Consequences

- Standalone compiled binaries execute Lighthouse audits out of the box with no external runtime dependencies, and headless packages stay pure domain libraries rather than process orchestrators; see [Performance Auditing Architecture](../architecture/lighthouse.md) and [ADR 0004](0004-lighthouse-daemon-api-isolation-and-sse.md) for cancellation and daemon job management.
