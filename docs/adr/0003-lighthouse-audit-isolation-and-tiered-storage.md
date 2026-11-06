# Lighthouse audit subprocess isolation and 3-tier storage

## Context

Lighthouse v13 (`lighthouse@13.5.0`) executes CPU-intensive trace analysis (`@paulirish/trace_engine`), frame-by-frame Speedline JPEG decoding, and synchronous HTML report generation while mutating process-global state in `lighthouse-logger`. Running Lighthouse on the main Hono daemon or CLI thread freezes concurrent HTTP/SSE connections for several seconds and corrupts concurrent runs. Furthermore, raw Lighthouse Result (LHR) JSON and standalone HTML reports range from 1 MB to 5 MB per run due to embedded base64 screenshots, which degrades SQLite table scan performance if stored inline, while computing independent per-metric medians across `--runs <N>` synthesizes a "Frankenstein" result that contradicts the saved report artifacts.

## Decision

1. **Direct In-Process Iteration Execution with Browser Process Isolation**: Execute Lighthouse iterations directly in-process (`packages/lighthouse/src/runner.ts` and `worker.ts`), paired with a headless Chromium instance resolved via `@devtools/browser` (`resolveBrowserPath`) and launched via `chrome-launcher` on an ephemeral port (`port: 0`) with deterministic `finally` teardown and signal listeners (`SIGTERM`, `SIGINT`). Standalone compiled binaries (`dist/devtools`) can execute audits without requiring an external `bun` runtime or loose script files on disk. Background concurrency isolation is owned by application service boundaries (`apps/api`), keeping domain libraries headless and self-contained.
2. **Representative Run Selection**: When `--runs <N>` ($N > 1$) is requested, execute $N$ sequential iterations and select a single **Representative Run** using minimum squared Euclidean distance to the batch median First Contentful Paint (`first-contentful-paint`) and median Interactive (`interactive`, falling back to `total-blocking-time` when unavailable). Persist one canonical database row and one artifact directory per audit execution while recording the $N$-run distribution in `summary_json.medianMetadata`.
3. **3-Tier Hot / Warm / Cold Storage**:
   - **Hot relational columns (`lighthouse_runs` in `@devtools/db`)**: Store indexed metadata (`url`, `final_url`, `form_factor`, `throttling_method`, `created_at`, `duration_ms`), the 4 integer category scores (`0–100`), and the 6 Core Web Vitals (`lcp_ms`, `cls`, `tbt_ms`, `fcp_ms`, `si_ms`, `ttfb_ms`) for sub-millisecond list, filter, and delta queries.
   - **Warm structured summary (`summary_json` column)**: Store a compact (~5-15 KB) normalized JSON object (`LighthouseRunSummaryData`) containing LCP element + phase breakdown (`lcp-breakdown-insight`), CLS culprits (`cls-culprits-insight`), prioritized `*-insight` diagnostics, and failed audit summaries.
   - **Cold disk artifacts (`json_report_path`, `html_report_path`)**: Write full `report.json` and `report.html` payloads to `<artifactsDir>/<runId>/` resolved via a 4-tier ADR 0002 configuration seam (`resolveArtifactsDir`).
4. **Package Ownership Boundary**: Keep `@devtools/core` free of Lighthouse-specific schemas. Define the `lighthouse_runs` Drizzle table in `packages/db/src/schema/lighthouse.ts` and house all Lighthouse domain types, Zod schemas, normalizers, and runner services in `@devtools/lighthouse` (`packages/lighthouse`).

## Consequences

- Direct in-process execution removes external runtime dependencies and enables compiled standalone CLI binaries (`dist/devtools`) to execute Lighthouse audits out-of-the-box.
- Historical queries, CLI delta diffs, and UI dashboards read hot columns and warm `summary_json` without parsing multi-megabyte disk files, while full HTML/JSON reports remain accessible on demand.
- Every persisted metric and score corresponds 1:1 with the saved `.json` and `.html` report artifacts.

## Addendum (2026-11-06): Direct In-Process Execution & Architectural Boundary

During black-box testing of the standalone compiled binary (`dist/devtools`), child process spawning of `worker.ts` via `Bun.spawn([process.execPath, workerScriptPath])` failed because `process.execPath` resolved to the compiled binary rather than a `bun` interpreter, and standalone binary virtual filesystems (`/$bunfs/root/`) do not expose loose TypeScript scripts.

To remediate this defect without compromising domain cleanliness:

- `packages/lighthouse` transitions to direct in-process iteration execution (`executeIteration`). Monorepo packages act as pure headless domain libraries rather than process orchestrators.
- Process-level worker thread isolation or queue-based background workers are owned by application daemons (`apps/api`) at the application service boundary.
- Headless Chrome lifecycle management continues to enforce ephemeral ports (`port: 0`) and deterministic process termination inside `finally` blocks.
