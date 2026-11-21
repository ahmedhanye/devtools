# Glossary

Canonical domain vocabulary for DevTools.

## Language

### Performance auditing

**Audit Job**:
The transient execution lifecycle of a triggered audit from start through completion, cancellation, or failure, independent of any persisted Audit Run.
_Avoid_: Live run, active scan, background task

**Iteration**:
A single isolated navigation pass executing Lighthouse against a target URL under a chosen form factor and throttling profile.
_Avoid_: Pass, probe, sample

**Audit Run**:
A completed, persisted audit record representing the outcome of an audit batch.
_Avoid_: Scan, test run, page check, benchmark

**Representative Run**:
The single actual Iteration selected from a multi-iteration batch as most representative of the batch, rather than a synthetic average.
_Avoid_: Median run, average run, synthetic run, aggregated run

**Insight Audit**:
A performance diagnostic consolidating legacy Lighthouse opportunities and root-cause element attributions.
_Avoid_: Legacy opportunity, trace check, performance hint

**Audit Summary**:
The compact structured diagnostic summary persisted for fast queries, containing element attributions, prioritized Insight Audits, failed checks, and batch distribution metadata.
_Avoid_: Raw LHR, summary blob, report metadata

**Report Artifact**:
The complete saved Lighthouse result and standalone report viewer stored on disk for a Representative Run.
_Avoid_: Report dump, raw output, audit cache

**Performance Budget**:
An automated threshold assertion enforcing minimum category scores or maximum Core Web Vitals limits that fails an audit on regression.
_Avoid_: Score gate, perf check, budget limit

**Agent Mode**:
A concise, un-truncated report format for coding agents that strips boilerplate while preserving exact DOM selectors and phase breakdowns.
_Avoid_: LLM dump, text output, compact report

### Runtime and browser

**Daemon**:
The local long-running server hosting DevTools API endpoints and web dashboard assets on a loopback port.
_Avoid_: Unified loopback daemon, background server, host process, separate API daemon, reverse proxy setup

**Browser Resolution Waterfall**:
The ordered precedence sequence (explicit override, managed cache, system probes, then remediation stop) used to locate a Chromium binary.
_Avoid_: Browser detection chain, chrome locator pipeline, browser discovery fallback

**Managed Browser Cache**:
The local directory where DevTools downloads and stores Chrome for Testing binaries.
_Avoid_: Download cache, browser store, local chromium dir

## Flagged ambiguities

- **Audit Job vs. Audit Run**: An Audit Job is the transient, single-flight daemon execution that persists nothing if cancelled or failed early; an Audit Run is a completed audit batch persisted with its own identifier.
- **Iteration vs. Audit Run**: An Iteration is one isolated navigation pass inside a multi-iteration batch; an Audit Run is the single persisted record saved for that batch.
- **Representative Run vs. Per-Metric Median**: Computing independent medians per metric creates a synthetic result that contradicts the saved Report Artifact, so DevTools selects one real Representative Run.
