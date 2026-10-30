# Lighthouse audit subprocess isolation and 3-tier storage

## Context

Lighthouse v13 (`lighthouse@13.5.0`) executes CPU-intensive trace analysis (`@paulirish/trace_engine`), frame-by-frame Speedline JPEG decoding, and synchronous HTML report generation while mutating process-global state in `lighthouse-logger`. Running Lighthouse on the main Hono daemon or CLI thread freezes concurrent HTTP/SSE connections for several seconds and corrupts concurrent runs. Furthermore, raw Lighthouse Result (LHR) JSON and standalone HTML reports range from 1 MB to 5 MB per run due to embedded base64 screenshots, which degrades SQLite table scan performance if stored inline, while computing independent per-metric medians across `--runs <N>` synthesizes a "Frankenstein" result that contradicts the saved report artifacts.

## Decision

1. **Subprocess Worker Isolation**: Execute programmatic Lighthouse runs inside an isolated child process (`packages/lighthouse/src/worker.ts`) spawned via `Bun.spawn`, paired with a headless Chromium instance resolved via `@devtools/browser` (`resolveBrowserPath`) and managed by `chrome-launcher` on an ephemeral port (`port: 0`) with deterministic `finally` and signal teardown.
2. **Representative Run Selection**: When `--runs <N>` ($N > 1$) is requested, execute $N$ sequential iterations and select a single **Representative Run** using minimum squared Euclidean distance to the batch median First Contentful Paint (`first-contentful-paint`) and median Interactive (`interactive`, falling back to `total-blocking-time` when unavailable). Persist one canonical database row and one artifact directory per audit execution while recording the $N$-run distribution in `summary_json.medianMetadata`.
3. **3-Tier Hot / Warm / Cold Storage**:
   - **Hot relational columns (`lighthouse_runs` in `@devtools/db`)**: Store indexed metadata (`url`, `final_url`, `form_factor`, `throttling_method`, `created_at`, `duration_ms`), the 4 integer category scores (`0–100`), and the 6 Core Web Vitals (`lcp_ms`, `cls`, `tbt_ms`, `fcp_ms`, `si_ms`, `ttfb_ms`) for sub-millisecond list, filter, and delta queries.
   - **Warm structured summary (`summary_json` column)**: Store a compact (~5-15 KB) normalized JSON object (`LighthouseRunSummaryData`) containing LCP element + phase breakdown (`lcp-breakdown-insight`), CLS culprits (`cls-culprits-insight`), prioritized `*-insight` diagnostics, and failed audit summaries.
   - **Cold disk artifacts (`json_report_path`, `html_report_path`)**: Write full `report.json` and `report.html` payloads to `<artifactsDir>/<runId>/` resolved via a 4-tier ADR 0002 configuration seam (`resolveArtifactsDir`).
4. **Package Ownership Boundary**: Keep `@devtools/core` free of Lighthouse-specific schemas. Define the `lighthouse_runs` Drizzle table in `packages/db/src/schema/lighthouse.ts` and house all Lighthouse domain types, Zod schemas, normalizers, and runner services in `@devtools/lighthouse` (`packages/lighthouse`).

## Consequences

- Daemon HTTP routes and SSE progress streams remain responsive during heavy trace and Speedline analysis.
- Historical queries, CLI delta diffs, and UI dashboards read hot columns and warm `summary_json` without parsing multi-megabyte disk files, while full HTML/JSON reports remain accessible on demand.
- Every persisted metric and score corresponds 1:1 with the saved `.json` and `.html` report artifacts.
