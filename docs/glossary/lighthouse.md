# Performance Auditing Context

Domain terms for isolated Lighthouse execution, representative run selection, trace insights, and 3-tier audit storage.

## Language

**Audit Job**:
The transient daemon-managed execution lifecycle from trigger through completion or failure, independent of a persisted Audit Run.
_Avoid_: Live run, active scan, background task

**Audit Run**:
A single isolated navigation pass executing Lighthouse against a target URL under a chosen form factor and throttling profile.
_Avoid_: Scan, test run, page check, benchmark

**Representative Run**:
The single actual Audit Run selected from a multi-run batch whose First Contentful Paint and Time to Interactive have the minimum squared Euclidean distance to the batch medians.
_Avoid_: Median run, average run, synthetic run, aggregated run

**Insight Audit**:
A trace-engine performance diagnostic consolidating legacy Lighthouse opportunities and root-cause element attributions.
_Avoid_: Legacy opportunity, trace check, performance hint

**Audit Summary**:
The normalized warm JSON summary persisted in the database containing element attributions, prioritized Insight Audits, failed checks, and multi-run distribution metadata.
_Avoid_: Raw LHR, summary blob, report metadata

**Report Artifact**:
The cold on-disk JSON and HTML file pair storing the complete Lighthouse Result and standalone report viewer for a Representative Run.
_Avoid_: Report dump, raw output, audit cache

**Performance Budget**:
An automated threshold assertion enforcing minimum category scores or maximum Core Web Vitals limits that fails the run on regression.
_Avoid_: Score gate, perf check, budget limit

**Agent Mode**:
An un-truncated, token-budgeted Markdown report format designed for AI coding agents that strips boilerplate and preserves exact DOM selectors and phase breakdowns.
_Avoid_: LLM dump, text output, compact report

## Flagged ambiguities

- **Audit Job vs. Audit Run:** An Audit Job is the transient, single-flight daemon execution that writes nothing if cancelled or failed early; an Audit Run is a completed pass persisted with its own run identifier.
- **Representative Run vs. Per-Metric Median:** Computing independent medians per metric creates a synthetic result that contradicts the saved Report Artifact, so DevTools always picks one real Representative Run.
- **Audit Summary vs. Report Artifact:** An Audit Summary is the compact structured summary stored inline for fast queries, whereas a Report Artifact is the multi-megabyte raw file pair stored on disk.
