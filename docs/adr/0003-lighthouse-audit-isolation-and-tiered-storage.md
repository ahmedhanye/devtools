---
status: partially superseded by ADR-0005
date: 2026-10-30
contexts:
  - Performance Auditing
  - Persistence
  - Runtime & CLI
---

# Lighthouse audit subprocess isolation and 3-tier storage

> **Status note:** Subprocess worker isolation (Decision 1) is superseded by [ADR 0005](0005-in-process-lighthouse-execution.md). Representative Run selection, 3-tier storage, and package ownership remain active.

## Decisions

1. **Subprocess worker isolation (superseded by [ADR 0005](0005-in-process-lighthouse-execution.md)):** Originally ran Lighthouse audits in a `Bun.spawn` child worker (`worker.ts`) with headless Chrome on an ephemeral port so trace analysis and global logger mutations would not block the daemon.
2. **Representative Run selection:** Multi-run audits select one real Audit Run closest by squared Euclidean distance to the batch median First Contentful Paint and Interactive metrics rather than synthesizing independent per-metric medians that contradict saved reports.
3. **3-tier storage:** Persist indexed scores and Core Web Vitals as hot relational columns, compact insight diagnostics as a warm JSON summary, and multi-megabyte HTML and JSON payloads as cold disk Report Artifacts so table scans stay fast.
4. **Package ownership boundary:** Keep `@devtools/core` free of Lighthouse schemas; store the relational table in `@devtools/db` and house all Lighthouse types, Zod schemas, and audit logic in `@devtools/lighthouse`.

## Consequences

- Persisted metrics and scores match saved report artifacts 1:1, and dashboards query hot and warm fields without parsing multi-megabyte files; see [Performance Auditing Architecture](../architecture/lighthouse.md) for schemas, formulas, and artifact path rules.
