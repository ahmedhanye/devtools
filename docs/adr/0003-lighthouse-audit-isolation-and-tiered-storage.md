---
status: partially superseded by ADR-0005
date: 2026-10-30
---

# Lighthouse audit subprocess isolation and 3-tier storage

> [!NOTE]
> Subprocess worker isolation (Decision 1) is superseded by [ADR 0005](0005-in-process-lighthouse-execution.md). Representative Run selection, 3-tier storage, and package ownership remain active.

## Decisions

1. **Subprocess worker isolation (superseded by [ADR 0005](0005-in-process-lighthouse-execution.md)):** Originally isolated Lighthouse audits in a `Bun.spawn` child worker with headless Chrome so trace analysis and global logger mutations would not block the daemon.
2. **Representative Run selection:** Multi-run audits pick one actual Audit Run closest by squared Euclidean distance to batch median First Contentful Paint and Time to Interactive rather than synthesizing per-metric medians that contradict saved reports.
3. **3-tier storage:** Persist indexed scores and Core Web Vitals in hot relational columns, compact insight diagnostics in a warm JSON Audit Summary, and multi-megabyte JSON and HTML Report Artifacts on disk so list queries avoid parsing multi-megabyte files.
4. **Package ownership boundary:** Keep `@devtools/core` free of Lighthouse schemas, store the relational table in `@devtools/db`, and house Lighthouse types, Zod schemas, and audit logic in `@devtools/lighthouse`.

## Consequences

- Persisted metrics match saved Report Artifacts 1:1, and dashboards query hot and warm fields without disk I/O; see [Performance auditing architecture](../architecture/lighthouse.md) for schemas, formulas, and storage layout.
