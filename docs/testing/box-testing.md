# Box testing standards

Reference guide for black-box, gray-box, and white-box testing methodologies, machine vs human verification boundaries, static gates, mutation analysis, and the monorepo workspace matrix. For test level naming (`*.unit.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`, `*.stories.tsx`), prohibited anti-patterns, and QA axis command routing, see [`TESTING.md`](../../TESTING.md).

## Black-box testing

Black-box testing ([`e2e-tests.md`](e2e-tests.md), [`stories.md`](stories.md)) verifies observable behavior against specifications and user stories without coupling tests to private implementation details.

### Adversarial CLI parser and environment probes

- **Numeric flag and environment fuzzing.** Probe numeric CLI flags (`--port`, `--runs`) and environment variables (`PORT`) with partial numeric strings (`4000abc`), floats (`4000.5`), `NaN`, negative numbers, and empty strings (`Number("") === 0`) to confirm integer parsers reject malformed input with human-readable `stderr` diagnostics rather than truncating prefixes or dumping raw schema JSON. For UI component probes (`apps/frontend`), verify semantic ARIA roles, keyboard controls (`Enter`, `Escape`, `Tab`), and completed overlay or toggle transitions in Storybook `play()` functions ([`stories.md`](stories.md)).
- **Probe environment hygiene.** Preserve `PATH` so runtime binaries (`bun`, `node`) resolve normally, use injectable configuration seams (`packages/browser`) rather than passing dummy binaries such as `/bin/sh`, set `DEVTOOLS_DB_PATH=":memory:"` (or an isolated temporary directory path) so daemon subprocess probes never create or mutate `.devtools/devtools.db`, and sanitize `HOST` and `PORT` in spawned subprocess environments so ambient container variables never skew host or port assertions.

### Machine checks vs sensory verification

Separate deterministic automated checks from items requiring human sensory judgment:

| Domain                         | Deterministic automated checks                                                                                                       | Sensory verification (placed at end of PR description)                                              |
| :----------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| **CLI (`apps/cli`)**           | Exit codes, `stdout`/`stderr` separation, `--json` schema conformance, signal teardown, temp-dir side effects, `bun run build:smoke` | Ergonomics of interactive TTY prompts, readability of `--help` copy for new users                   |
| **Frontend (`apps/frontend`)** | ARIA roles, DOM visibility, Storybook `play()` interactions, `react-doctor`, `steiger`, Next.js build                                | Visual hierarchy, typography spacing, responsive feel across zoom levels, real screen-reader pacing |
| **Docs (`site`)**              | Link integrity, Fumadocs query symmetry, `/llms.txt` and search routes, MDX build                                                    | Narrative flow, diagram legibility, editorial clarity                                               |

Run all deterministic checks in automated test suites; reserve exploratory sensory verification sections strictly for visual, typography, or unmocked credential checks.

## Gray-box testing

Gray-box testing ([`integration-tests.md`](integration-tests.md)) pairs specification awareness with visibility into module interfaces (`index.ts`), HTTP contracts, database schemas, and architectural layer rules without binding tests to private helper bodies.

### Seam classification, state lifecycles, and contract fidelity

- **Local-substitutable adapters.** Use socketless `createApp().request()` (`apps/api`), ephemeral loopback servers on `port: 0` (`apps/cli`), and `:memory:` SQLite instances (`packages/db`) instead of mocking owned modules or calling internal pure validator helpers directly.
- **HTTP header, media-type, and raw wire URI probes.** Probe HTTP routes, security middleware, and static-asset handlers (`apps/api`, `apps/cli` daemon) using `createApp().request()` or loopback sockets for payload logic and parameterized media types (`Content-Type: application/json; charset=utf-8`), and use raw `node:http` sockets or `curl --path-as-is` whenever testing missing or malformed `Host`, spoofed `Origin` or `Sec-Fetch-Site`, single-encoded dot segments (`/%2e%2e/`), double-encoded path traversal (`/%252e%252e/`), or malformed percent-encoding (`/%E0%A4%A`, `/%ZZ`) because `fetch()`, `new URL()`, and default `curl` normalize paths and restrict headers client-side. Verify disallowed mutating methods return `405 Method Not Allowed` with an `Allow` header on method-restricted endpoints, or `404` where routes reject unregistered method and path pairs.
- **SQLite constraint and transaction integrity.** Verify Drizzle migrations are idempotent across repeated runs, per-connection foreign-key pragmas remain enforced, and mid-flight exceptions roll back transactions cleanly (`packages/db`).
- **Mock and fake contract fidelity.** Where an external boundary (`packages/browser` binary probes, `packages/lighthouse` browser launcher and iteration seams) requires an injectable seam per [ADR 0002](../adr/0002-package-configuration-and-environment-seams.md) and [ADR 0003](../adr/0003-lighthouse-audit-isolation-and-tiered-storage.md), verify that the test fake returns the exact schemas, exit codes, and typed `Error` subclasses (preserving `cause`) emitted by the real producer.
- **Stateful singleton lifecycle.** When testing modules that cache a singleton connection or instance (`getDb()` and `resetDb()` in `@devtools/db`), verify that sequential calls with different options or database paths reset or return the requested instance rather than serving a stale cached handle.

### Architectural boundaries and security gates

- **Workspace dependency boundaries.** Run `bun run fallow:arch` to verify unidirectional dependency flow (`.fallowrc.json`) so `packages/*` remain independent of `apps/*` and `site/`.
- **Feature-Sliced Design layers.** Run `bun run lint:fsd` (`steiger ./src`) in `apps/frontend` to verify top-down layer imports (`app`, `pages`, `features`, `entities`, `shared`) without cross-slice imports.
- **Security candidate analysis.** Run `bun run fallow:security` on modified boundary files to catch unvalidated inputs, path traversal risks, or unsafe command arguments.
  - **Triage guidance.** Separate runtime sinks (unsanitized HTML/SVG markup injection, unvalidated `Host` headers, unescaped path traversals) from developer-controlled build scripts and test fixtures.

## White-box testing

White-box testing ([`unit-tests.md`](unit-tests.md)) audits internal control flow, statement and branch coverage, cyclomatic and cognitive complexity, unit test suites, and mutation sensitivity. Every non-equivalent mutation on a modified branch must cause at least one assertion in `*.unit.test.ts` to fail (`verify:diff-coverage` enforces 100% line coverage, and unit assertions kill non-equivalent relational, logical, and guard-deletion mutants).

### Code health and complexity gates

- **Complexity hotspots.** Run `bun run fallow:health` (`fallow health --complexity --complexity-breakdown`) to locate functions with elevated cyclomatic or cognitive complexity.
- **Dead code.** Run `bun run fallow:dead-code` (`fallow dead-code --type-aware`) to catch unused exports, files, or dependencies.
- **Semantic duplication.** Run `bun run fallow:dupes` (`fallow dupes --mode semantic`) to detect duplicated logic shapes across modules.
  - **Triage guidance.** Filter out idiomatic boilerplate such as TSDoc descriptions, distinct domain error subclasses, and declarative Drizzle ORM column definitions when assessing duplication reports.

## Monorepo testing matrix

Each workspace maps to specific testing domains, runners, file patterns, and verification responsibilities:

| Workspace             | Domain               | Runner       | Standard file patterns                                                            | Verification focus                                                                                                                                                                                                       |
| :-------------------- | :------------------- | :----------- | :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`       | White-box            | `bun:test`   | `tests/*.unit.test.ts`                                                            | `RuntimeConfigSchema`, `HealthResponseSchema`, `ApiErrorResponseSchema`, `API_ERROR_CODES`, barrel exports                                                                                                               |
| `packages/db`         | White / Gray         | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`                           | `resolveDatabasePath` env seams, `:memory:` SQLite connection, `runMigrations` idempotency, schema queries                                                                                                               |
| `packages/browser`    | White / Gray         | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`                           | Browser config, waterfall timing math, OS binary detection seams, archive installer seams                                                                                                                                |
| `packages/lighthouse` | White / Gray / Black | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`<br>`tests/*.e2e.test.ts`  | Audit config & path confinement, median run selection, LHR normalizer, shared `diff`, `@devtools/lighthouse/schemas`, SQLite `runs.ts` queries, `AbortSignal` batch cancellation, direct iteration execution, live audit |
| `apps/api`            | White / Gray / Black | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`<br>`tests/*.e2e.test.ts`  | Socketless `createApp().request()`, `AuditJobManager`, Lighthouse & SSE routes, `serializers`, all-verb loopback peer/Host/Origin/CSRF guards, `resolveServerConfig`, mid-audit `stop()`, ephemeral server & `SIGTERM`   |
| `apps/cli`            | White / Gray / Black | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`<br>`tests/*.e2e.test.ts`  | Port discovery, browser & lighthouse subcommand seams (`context`, `budgets`, `formatters`), loopback `startDaemon` on `port: 0` & shutdown cancellation, static UI + `/api/*` routing, `Bun.spawn` & compiled binary E2E |
| `apps/frontend`       | White / Black        | `vitest`     | `src/**/*.unit.test.ts`<br>`src/**/*.stories.tsx`                                 | Hydration-safe hooks (`renderHook` without JSX), `cn`, Storybook Portable Stories (`composeStories` + `play()`)                                                                                                          |
| `site`                | White / Gray / Black | `bun:test`   | `tests/*.unit.test.ts`<br>`tests/*.integration.test.ts`<br>`tests/*.e2e.test.tsx` | `/llms.txt` & search routes, Fumadocs `getPage`/`getPageByUrl` symmetry, SSR landmark rendering, Mermaid config                                                                                                          |
| `scripts/`            | White-box            | `bun:test`   | `scripts/**/*.unit.test.ts`                                                       | LCOV path normalizer & merger, diff coverage calculator, staged secret scanner                                                                                                                                           |
| Monorepo root         | Black / Gray         | System / Bun | `bun run build:smoke`<br>`bun run fallow:arch`<br>`bun run lint:fsd`              | Standalone `dist/devtools` binary compile & `--help`, workspace boundary check, FSD layer check                                                                                                                          |
