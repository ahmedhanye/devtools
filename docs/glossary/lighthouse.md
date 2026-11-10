# Performance Auditing Context

Domain terms for isolated Lighthouse execution, multi-run median selection, trace insights, and 3-tier audit storage.

## Language

**Audit Job**:
The transient daemon-managed execution lifecycle from trigger through completion or failure, before or independent of a persisted **Audit Run** / **Representative Run**.
_Avoid_: Live run, active scan, background task

**Audit Run**:
A single isolated navigation pass executing Lighthouse against a target URL under a specific form factor (`mobile` or `desktop`) and throttling profile (`simulate`, `devtools`, or `provided`).
_Avoid_: Scan, test run, page check, benchmark

**Representative Run**:
The single actual Audit Run selected from a multi-run batch (`--runs <N>`) whose First Contentful Paint (FCP) and Time to Interactive (TTI) have the minimum squared Euclidean distance to the batch medians.
_Avoid_: Median run, average run, synthetic run, aggregated run

**Insight Audit**:
A trace-engine performance diagnostic (`*-insight`, such as `lcp-breakdown-insight`, `cls-culprits-insight`, or `document-latency-insight`) consolidating legacy Lighthouse opportunities and root-cause element attributions.
_Avoid_: Legacy opportunity, trace check, performance hint

**Audit Summary**:
The normalized warm JSON payload (`summary_json`) persisted in SQLite containing LCP element attribution, CLS culprits, prioritized Insight Audits, failed audit summaries, and multi-run median metadata.
_Avoid_: Raw LHR, summary blob, report metadata

**Report Artifact**:
The cold on-disk file pair (`report.json` and `report.html`) storing the complete Lighthouse Result (LHR) and standalone HTML viewer for a Representative Run.
_Avoid_: Report dump, raw output, audit cache

**Performance Budget**:
An automated threshold assertion evaluated via `--fail-under` that enforces minimum category scores (higher-is-better) or maximum Core Web Vitals thresholds (lower-is-better) and exits with non-zero status code on regression.
_Avoid_: Score gate, perf check, budget limit

**Agent Mode**:
An un-truncated, token-budgeted (~500 tokens) GitHub Flavored Markdown report format (`--agent`) optimized for AI coding agents that strips generic boilerplate, enforces zero ANSI escape codes, and presents exact DOM selectors, HTML snippets, bounding rectangles, and LCP phase breakdowns.
_Avoid_: LLM dump, text output, compact report

## Flagged ambiguities

- **Audit Job vs. Audit Run**: An Audit Job is the transient, single-flight execution managed by the daemon API (`POST /api/lighthouse/audits`, tracked by `jobId` via SSE and `/api/lighthouse/audits/active`), which creates no database row or report file if execution fails; an **Audit Run** / **Representative Run** is a completed navigation pass persisted in `lighthouse_runs` with a `runId`.
- **Representative Run vs. Per-Metric Median**: Computing independent medians across metrics produces a synthetic result that contradicts the saved Report Artifact and trace attributions; DevTools always selects one real Representative Run from the batch.
- **Audit Summary vs. Report Artifact**: An Audit Summary is the compact structured JSON stored inline in `lighthouse_runs.summary_json` for fast API and CLI queries, whereas a Report Artifact is the multi-megabyte raw `.json` and `.html` file pair stored on disk.
