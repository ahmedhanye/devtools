# Performance auditing architecture

Direct in-process Lighthouse execution with `AbortSignal` cancellation, Representative Run selection, and 3-tier audit persistence for `packages/lighthouse`.

## Module responsibilities

| Path                                   | Responsibility                                                                                        | Entrypoint                                                                      |
| :------------------------------------- | :---------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| `packages/lighthouse/src/contracts/`   | Actionable errors (`AuditCancelledError`, `WorkerExecutionError`), models, and browser-safe Zod DTOs. | `packages/lighthouse/src/contracts/schemas.ts` (`@devtools/lighthouse/schemas`) |
| `packages/lighthouse/src/domain/`      | Pure `AbortSignal` guard, pairwise `diff`, Euclidean `median`, and LHR `normalizer`.                  | `packages/lighthouse/src/domain/index.ts`                                       |
| `packages/lighthouse/src/application/` | Pure multi-run batch orchestration (`execute-batch.ts`) over injected `ports.ts`.                     | `packages/lighthouse/src/application/index.ts`                                  |
| `packages/lighthouse/src/config/`      | Artifact directory resolution and symlink confinement (`artifacts-config.ts`).                        | `packages/lighthouse/src/config/index.ts`                                       |
| `packages/lighthouse/src/infra/`       | SQLite store (`persistence/`) and in-process Chrome iteration + virtual FS shim (`runtime/`).         | `packages/lighthouse/src/wiring.ts`                                             |
| `packages/lighthouse/src/index.ts`     | Curated public package entrypoint (`openLighthouseStore`, `executeLighthouseBatch`, models).          | `packages/lighthouse/src/index.ts`                                              |

## Direct in-process iteration execution

```mermaid
sequenceDiagram
    participant App as "Application (CLI / API)"
    participant Store as "LighthouseStore (wiring.ts)"
    participant Batch as "execute-batch.ts"
    participant Browser as "@devtools/browser"
    participant Iter as "iteration.ts"
    participant Chrome as "Headless Chrome (port: 0)"
    participant Disk as "Report Artifacts"
    participant DB as "SQLite (@devtools/db)"

    App->>Store: store.runAudit(options)
    Store->>Batch: executeLighthouseBatch(options)
    Batch->>Browser: resolveBrowserPath(options) once
    loop Each iteration (1..N)
        Batch->>Iter: executeIteration({ ..., browser })
        Iter->>Browser: launchBrowserSession({ browser, disableSandbox, signal })
        Browser->>Chrome: launch on port 0 (ignoreDefaultFlags, handleSIGINT: false)
        Iter->>Chrome: run programmatic Lighthouse audit
        Chrome-->>Iter: Lighthouse Result and HTML report
        Iter->>Browser: session.kill() (finally block)
        Iter-->>Batch: SingleIterationResult
    end
    Batch->>Batch: select Representative Run and normalize Audit Summary
    Store->>Disk: write report.json and report.html
    Store->>DB: insert canonical row into lighthouse_runs
    Store-->>App: LighthouseAuditExecutionResult
```

### Execution lifecycle guarantees

1. **In-process purity and store encapsulation (ADR 0005).** `executeIteration` (`packages/lighthouse/src/infra/runtime/iteration.ts`) runs inside the active runtime with no `Bun.spawn` worker scripts per [ADR 0005](../adr/0005-in-process-lighthouse-execution.md), activating `ensureLighthouseVirtualFs()` lazily only during real executions so compiled binaries (`dist/devtools`) work out of the box. `openLighthouseStore` (`packages/lighthouse/src/wiring.ts`) encapsulates `@devtools/db` `openDb`, CRUD, diffing, report path resolution, and rollback-safe `persistBatch` so `apps/cli` and `apps/api` stay decoupled from `@devtools/db`.
2. **Batch-once browser resolution and ephemeral ports.** `executeLighthouseBatch` resolves Chromium once per batch and launches Chrome with `port: 0` and `ignoreDefaultFlags: true`.
3. **Cooperative cancellation.** `signal?: AbortSignal` flows through browser discovery, Chrome launch (`handleSIGINT: false`), and iteration loops, with `session.kill()` always running in `finally`.

## Representative Run selection

When an Audit Run batch executes multiple iterations (`--runs <N>`, $N > 1$), `computeRepresentativeRun` selects one actual run closest to the batch median rather than synthesizing contradictory per-metric medians:

1. Compute median First Contentful Paint (`first-contentful-paint`) and median Time to Interactive (`interactive`, falling back to `total-blocking-time` when null).
2. Minimize squared Euclidean distance per run:
   $$D^2 = (FCP_i - \widetilde{FCP})^2 + (TTI_i - \widetilde{TTI})^2$$
3. Break ties deterministically in favor of the earlier run, and retain distribution statistics inside `summary_json.medianMetadata`.

## 3-tier storage architecture

Per [ADR 0003](../adr/0003-lighthouse-audit-isolation-and-tiered-storage.md), `LighthouseStore` partitions persisted audit data across three tiers:

| Tier     | Storage location                            | Contents                                                                                                 |
| :------- | :------------------------------------------ | :------------------------------------------------------------------------------------------------------- |
| **Hot**  | Indexed `lighthouse_runs` SQLite columns    | URLs, form factor, throttling profile, timestamps, 4 category scores (`0` to `100`), 6 Core Web Vitals.  |
| **Warm** | `summary_json` SQLite column (~5 to 15 KB)  | Normalized Audit Summary: LCP/CLS attributions, prioritized Insight Audits, failed checks, distribution. |
| **Cold** | `<artifactsDir>/<runId>/report.{json,html}` | Full Lighthouse JSON and standalone HTML Report Artifacts; removed automatically if DB insert fails.     |

## Artifact Configuration Seam (ADR 0002)

`packages/lighthouse/src/config/artifacts-config.ts` resolves `<artifactsDir>` using injectable `env`, `cwd`, and `isStandalone` Configuration Seams:

| Priority | Condition                                                  | Resolved directory                           |
| :------: | :--------------------------------------------------------- | :------------------------------------------- |
|    1     | `options.customDir` or `DEVTOOLS_LIGHTHOUSE_ARTIFACTS_DIR` | Explicit override path                       |
|    2     | `NODE_ENV === "test"` or `BUN_ENV === "test"`              | `<tmpdir>/devtools-tests/lighthouse`         |
|    3     | Local workspace development (`!isStandaloneRuntime()`)     | `<repo_root>/.devtools/artifacts/lighthouse` |
|    4     | Compiled standalone binary or production default           | `~/.devtools/artifacts/lighthouse`           |
