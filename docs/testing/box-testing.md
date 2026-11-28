# Box testing standards

Reference guide for black-box, gray-box, and white-box testing methodologies, machine vs. sensory verification boundaries, static gates, and the monorepo workspace testing matrix. For test level naming, prohibited anti-patterns, and verification commands, see [`TESTING.md`](../../TESTING.md) and [`REVIEW.md`](../../REVIEW.md).

## Black-box testing

Black-box testing ([`e2e-tests.md`](e2e-tests.md), [`stories.md`](stories.md)) verifies observable behavior against specifications and user stories without coupling tests to private implementation details.

### Adversarial CLI parser and environment probes

- **Numeric flag and environment fuzzing.** Probe numeric CLI flags (`--port`, `--runs`) and environment variables (`PORT`) with partial numeric strings (`4000abc`), floats (`4000.5`), `NaN`, negative numbers, and empty strings (`Number("") === 0`) to confirm integer parsers reject malformed input with human-readable `stderr` diagnostics rather than truncating prefixes or dumping raw schema JSON. For UI component probes (`apps/frontend`), verify semantic ARIA roles, keyboard controls (`Enter`, `Escape`, `Tab`), and overlay transitions in Storybook `play()` functions ([`stories.md`](stories.md)).
- **Probe environment hygiene.** Preserve `PATH` so runtime binaries (`bun`, `node`) resolve normally, use injectable Configuration Seams (`packages/browser`) instead of dummy binaries such as `/bin/sh`, set `DEVTOOLS_DB_PATH=":memory:"` (or an isolated temporary directory) so Daemon subprocess probes never create or mutate `.devtools/devtools.db`, and sanitize `HOST` and `PORT` in spawned environments so ambient container variables never skew host or port assertions.

### Machine checks vs. sensory verification

| Domain                         | Deterministic automated checks                                                                                                       | Sensory verification (placed at end of PR description)                                              |
| :----------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| **CLI (`apps/cli`)**           | Exit codes, `stdout`/`stderr` separation, `--json` schema conformance, signal teardown, temp-dir side effects, `bun run build:smoke` | Ergonomics of interactive TTY prompts, readability of `--help` copy for new users                   |
| **Frontend (`apps/frontend`)** | ARIA roles, DOM visibility, Portable Story `play()` interactions, `react-doctor`, `steiger`, Next.js build                           | Visual hierarchy, typography spacing, responsive feel across zoom levels, real screen-reader pacing |
| **Docs (`site`)**              | Link integrity, Fumadocs query symmetry, `/llms.txt` and search routes, MDX build                                                    | Narrative flow, diagram legibility, editorial clarity                                               |

Automate all deterministic checks; reserve exploratory sensory verification sections strictly for visual, typography, or unmocked credential checks.

## Gray-box testing

Gray-box testing ([`integration-tests.md`](integration-tests.md)) pairs specification awareness with visibility into module interfaces (`index.ts`), HTTP contracts, database schemas, and architectural layer rules without binding tests to private helper bodies.

### Seam classification, state lifecycles, and contract fidelity

- **Local-substitutable adapters.** Use socketless `createApp().request()` (`apps/api`), ephemeral Daemons on `port: 0` (`apps/cli`), and `:memory:` SQLite handles (`packages/db`) instead of mocking owned modules or calling private validator helpers directly.
- **HTTP header, media-type, and raw wire URI probes.** Test payload logic and parameterized media types (`Content-Type: application/json; charset=utf-8`) via `createApp().request()` or loopback sockets. Use raw `node:http` sockets or `curl --path-as-is` when probing missing or malformed `Host`, spoofed `Origin` or `Sec-Fetch-Site`, single-encoded dot segments (`/%2e%2e/`), double-encoded traversal (`/%252e%252e/`), or malformed percent-encoding (`/%E0%A4%A`, `/%ZZ`) because `fetch()`, `new URL()`, and default `curl` normalize paths and restrict headers client-side. Verify disallowed mutating methods return `405 Method Not Allowed` with an `Allow` header on method-restricted endpoints, or `404` on unregistered method and path pairs.
- **SQLite constraint and transaction integrity.** Verify Lazy Schema Initialization (`initializeBaselineSchema`) applies missing SHA-256 migrations idempotently while leaving foreign databases untouched, foreign-key pragmas stay enforced per connection, and mid-flight exceptions roll back `BEGIN IMMEDIATE` write transactions (`packages/db`).
- **Mock and fake contract fidelity.** Where external boundaries (`packages/browser` probes, `packages/lighthouse` browser launcher and iteration seams) require injectable seams per [Monorepo package standards](../coding-standards/packages.md), [ADR 0003](../adr/0003-lighthouse-audit-isolation-and-tiered-storage.md), and [ADR 0005](../adr/0005-in-process-lighthouse-execution.md), verify that test fakes emit the exact schemas, exit codes, and typed `Error` subclasses (preserving `cause`) produced by the real adapter.
- **Database Handle and store lifecycle.** Verify lazy initialization (zero disk I/O before first access), automatic 30-second idle-close with self-healing reopen, explicit `DbHandle` disposal (`openDb`), borrowed `DbSession` isolation (`createLighthouseStore`), and isolated `:memory:` handles without ambient singleton state.

### Architectural boundaries and security gates

- **Workspace dependency boundaries.** Run `bun run boundaries` (`turbo boundaries`) for package-level import and undeclared-dependency checks, and `bun run fallow:arch` to verify `.fallowrc.json` intra-package import zones.
- **Feature-Sliced Design layers.** Run `bun run lint:fsd` (`steiger ./src`) in `apps/frontend` to verify top-down layer imports without cross-slice leakage.
- **Security candidate analysis.** Run `bun run fallow:security` on modified boundary files to catch unsanitized HTML/SVG sinks, unvalidated `Host` headers, or unescaped path traversals, filtering developer-controlled build scripts and test fixtures during triage.

## White-box testing

White-box testing ([`unit-tests.md`](unit-tests.md)) audits control flow, branch coverage, complexity, unit suites, and mutation sensitivity. Every non-equivalent mutation on a modified branch must cause at least one `*.unit.test.ts` assertion to fail (`verify:diff-coverage` enforces 100% line coverage).

### Code health and complexity gates

- **Complexity hotspots.** `bun run fallow:health` detects production functions with elevated cyclomatic or cognitive complexity and blocks regressions against `fallow-baselines/health-baseline.json`.
- **Semantic duplication ratchet.** `bun run fallow:dupes` (`--mode semantic --baseline fallow-baselines/dupes-baseline.json --fail-on-issues`) detects duplicated logic shapes and fails on new clone groups. Ignore idiomatic boilerplate such as TSDoc comments, distinct domain error subclasses, and declarative Drizzle column definitions during triage.
- **Dead code.** `bun run fallow:dead-code` (`--type-aware`) catches unused exports, files, and dependencies.

## Monorepo testing matrix

| Workspace             | Domain               | Runner       | Standard file patterns                                                            | Verification focus                                                                                                                                                                                                      |
| :-------------------- | :------------------- | :----------- | :-------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`       | White-box            | `bun:test`   | `tests/*.unit.test.ts`                                                            | `RuntimeConfigSchema`, `HealthResponseSchema`, `ApiErrorResponseSchema`, `API_ERROR_CODES`, `@devtools/core/node` (`createTeardown`, `attachHostSignals`, `findWorkspaceRoot`), barrel exports                          |
| `packages/db`         | White / Gray         | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`                           | `resolveDatabasePath` Configuration Seams, lazy `openDb` (`DbSession` vs. `DbHandle`), idle-close and disposal, SHA-256 `initializeBaselineSchema`, `BEGIN IMMEDIATE` + savepoints, multi-handle WAL concurrency        |
| `packages/browser`    | White / Gray         | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`                           | Browser config, waterfall timing math, `AbortSignal` propagation across resolution/launch/install, OS binary detection seams, archive installer seams                                                                   |
| `packages/lighthouse` | White / Gray / Black | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`<br>`tests/*.e2e.test.ts`  | Artifact config and symlink confinement, Representative Run selection, LHR normalizer, `diff`, `@devtools/lighthouse/schemas`, `createLighthouseStore`, `AuditJobManager`, `serializers`, `AbortSignal`, live audit     |
| `apps/api`            | White / Gray / Black | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`<br>`tests/*.e2e.test.ts`  | Socketless `createApp().request()`, Lighthouse and SSE routes, `bindManagedServer` LIFO teardown, all-verb loopback peer/Host/Origin/CSRF guards, `resolveServerConfig`, mid-audit `stop()`, ephemeral server `SIGTERM` |
| `apps/cli`            | White / Gray / Black | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`<br>`tests/*.e2e.test.ts`  | Port discovery, browser and lighthouse command seams (`context`, `budgets`, `formatters`), Daemon `startDaemon` on `port: 0` and shutdown cancellation, static UI + `/api/*` routing, `Bun.spawn` and binary E2E        |
| `apps/frontend`       | White / Black        | `vitest`     | `src/**/*.unit.test.ts`<br>`src/**/*.stories.tsx`                                 | Hydration-safe hooks (`renderHook` without JSX), `cn`, Portable Stories (`composeStories` + `play()`)                                                                                                                   |
| `site`                | White / Gray / Black | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`<br>`tests/*.e2e.test.tsx` | `/llms.txt` and search routes, Fumadocs `getPage`/`getPageByUrl` symmetry, SSR landmark rendering, Mermaid config                                                                                                       |
| `scripts/`            | White-box            | `bun:test`   | `scripts/**/*.unit.test.ts`                                                       | LCOV path normalizer and merger, diff coverage calculator, staged secret scanner                                                                                                                                        |
| Monorepo root         | Black / Gray         | System / Bun | `bun run build:smoke`<br>`bun run fallow:arch`<br>`bun run lint:fsd`              | Standalone `dist/devtools` binary compile and `--help`, workspace boundary check, FSD layer check                                                                                                                       |
