# Performance Auditing Context

Domain terms for isolated Lighthouse execution, multi-run median selection, trace insights, and 3-tier audit storage.

## Language

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

## Flagged ambiguities

- **Representative Run vs. Per-Metric Median**: Computing independent medians across metrics produces a synthetic result that contradicts the saved Report Artifact and trace attributions; DevTools always selects one real Representative Run from the batch.
- **Audit Summary vs. Report Artifact**: An Audit Summary is the compact structured JSON stored inline in `lighthouse_runs.summary_json` for fast API and CLI queries, whereas a Report Artifact is the multi-megabyte raw `.json` and `.html` file pair stored on disk.
