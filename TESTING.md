# DevTools testing standards

Testing philosophy, hermetic isolation rules, prohibited anti-patterns, and test level separation across the DevTools monorepo.

## Core testing philosophy and invariants

Compilers and static analyzers enforce structural invariants (`tsc --noEmit`, `oxlint`, `fallow`, `steiger`, `react-doctor`). Reserve runtime test suites for observable runtime behavior, schema boundaries, state transitions, and error handling that static tools cannot verify.

> [!IMPORTANT]
> Pull requests require **100% LCOV line coverage** (`DA:` hits > 0) on modified executable lines via [REVIEW.md](REVIEW.md). Every function branching on runtime environment state must test both its injected seam and its omitted-argument default path (seam-pair rule).

### Hermetic isolation and authoring rules

- **Hermetic resources.** Test suites run concurrently without shared mutable state: Daemons bind ephemeral port `0`, SQLite suites use `:memory:`, Hono API suites use socketless `app.request()`, and file-writing tests use isolated `fs.mkdtempSync()` directories.
- **Seam-pair rule and call-chain forwarding.** Centralize environment reads in `config.ts` with `env?: Record<string, string | undefined>` per [Monorepo package standards](docs/coding-standards/packages.md) instead of mutating globals (`process.getuid`, `Bun.stdin`, ambient `process.env`). Functions branching on runtime state (`isTTY`, `process.platform`, `process.getuid`, signals) or external boundaries (`spawnCommand`, browser binaries) accept an optional seam with production defaults and test both the injected seam and the default omitted-argument path in separate unit tests. Intermediate helpers must forward the full seam object downstream.
- **Vertical TDD slices at agreed seams.** Work in vertical red-green-refactor cycles: write one failing test at a public seam, implement the minimal code to pass it, then repeat.
- **Diff coverage exemptions.** `scripts/verify-diff-coverage/verify-diff-coverage.ts` exempts type-only files (`Bun.Transpiler`), `*.test.*`, `*.spec.*`, `**/tests/**`, `*.stories.*`, `.storybook/**`, `*.d.ts`, `*.config.*`, `.agents/**`, and thin App Router boundary adapters (`apps/frontend/src/app/**/*.next.{ts,tsx}`). For verification commands, see [REVIEW.md](REVIEW.md) (and [Stacked pull requests](docs/contributing/pull-request/stacked-prs.md) for `BASE_REF`).

### Prohibited testing anti-patterns and false-positive guards

Reject these nine test anti-patterns across all workspaces:

| Anti-pattern                             | Why it fails                                                                    | What to assert instead                                                                          |
| :--------------------------------------- | :------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------- |
| **1. Static copy and prose**             | Breaks on wording edits and tests zero logic                                    | Semantic HTML landmarks (`<header>`, `<main>`, `<nav>`, `<footer>`) or structured schema fields |
| **2. Hardcoded collection counts**       | `expect(pages.length).toBe(13)` breaks whenever content is added                | Non-empty collection (`length > 0`) plus per-item schema validation                             |
| **3. Exact nav or heading strings**      | Couples tests to information architecture labels                                | Query symmetry (`source.getPage(slug)` resolves the same page as `source.getPageByUrl(url)`)    |
| **4. Utility CSS classes**               | `expect(html).toContain("bg-primary")` couples tests to Tailwind tokens         | Accessible ARIA roles (`getByRole`), semantic elements, or `data-slot` attributes               |
| **5. Trivial constant or type equality** | `expect(CODE).toBe("CODE")` tests JavaScript assignment                         | Schema parsing (`ApiErrorResponseSchema.parse(payload)`) or behavioral output                   |
| **6. Tautological assertions**           | Recomputes expected values with the production formula, passing by construction | Independent known-good literal values from the specification                                    |
| **7. Implementation-coupled mocks**      | Spies on internal helpers, asserts call order, or queries DB side channels      | Public module return values and state; mock only at external system boundaries                  |
| **8. Weak coverage padding**             | Calls functions with `expect(res).toBeDefined()` only to satisfy LCOV line hits | Exact domain properties, error codes, and mutation-killing boundary values                      |
| **9. Unverified snapshot abuse**         | Large snapshots lock in bugs and encourage blind snapshot updates               | Targeted structural or inline schema assertions                                                 |

Apply these repository false-positive guards during review:

- **CLI `--help` output vs. decorative UI prose.** Asserting command descriptions and flag names in CLI `--help` output (`apps/cli/tests/cli.e2e.test.ts`) verifies a public CLI contract and is not Anti-pattern #1.
- **Interactive vs. stateless portable stories.** Stateful interactive components (`Dialog`, `Drawer`, `DropdownMenu`, `Sheet`, `Tooltip`, forms) require `play()` interaction tests using `storybook/test`; stateless presentational primitives (`Badge`, `Card`, `Separator`, `Skeleton`) require only visual render stories (`docs/testing/stories.md`).
- **Barrel export smoke checks and repository self-checks.** Evaluate full test files and sibling suites before flagging `index.unit.test.ts` barrel checks alongside behavioral tests, or intentional repository self-checks in `scripts/**/*.unit.test.ts`.
- **Duplication triage.** Filter `fallow:dupes` output to ignore idiomatic boilerplate such as TSDoc comments, distinct domain error subclasses (`@devtools/core`), and declarative Drizzle ORM column definitions (`packages/db`).

## Test level separation and file naming

Automated tests are partitioned into three non-overlapping levels by visibility and execution cost:

| Test level                    | Target file pattern              | Package script     | Visibility                       | Scope and methodology focus                                                                                                                                     |
| :---------------------------- | :------------------------------- | :----------------- | :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **White-box (Unit)**          | `*.unit.test.ts`                 | `test:unit`        | Code internals, AST, branches    | Pure functions, Zod schemas, error classes, React hooks (`renderHook` without JSX), `scripts/`, static complexity, and diff coverage                            |
| **Gray-box (Integration)**    | `*.integration.test.ts`          | `test:integration` | Module seams, contracts, schemas | Socketless Hono routes (`app.request()`), ephemeral Daemons (`port: 0`), `:memory:` SQLite stores (`openDb`, `createLighthouseStore`), adapters, `site` loaders |
| **Black-box (E2E & Stories)** | `*.e2e.test.ts`, `*.stories.tsx` | `test:e2e`         | External observable behavior     | Subprocess CLI binaries (`Bun.spawn`), portable stories (`play()`), exploratory external probes, and binary smoke checks                                        |

**Single-level file rule.** Place one test level per file using its matching suffix (`*.unit.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`, or `*.stories.tsx`). Keep unit, integration, and end-to-end `describe` blocks in separate files.

**Verification.** Follow [REVIEW.md](REVIEW.md) for verification commands (treat unprovisioned browser binaries during White-box coverage runs as a Black-box environment status finding rather than installing global tools).

## Testing guides

| Guide                                                        | Read when                                                                                                                          |
| :----------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| [Box testing standards](docs/testing/box-testing.md)         | Auditing black-, gray-, or white-box coverage, adversarial wire/CLI probes, static gates, or workspace matrix.                     |
| [Unit testing](docs/testing/unit-tests.md)                   | Writing `*.unit.test.ts` suites for schemas, errors, seam-pair branches, invariants, or React hooks.                               |
| [Integration testing](docs/testing/integration-tests.md)     | Writing `*.integration.test.ts` suites for Hono routes, ephemeral Daemons, `:memory:` SQLite, or adapters.                         |
| [Test quality and refactoring](docs/testing/test-quality.md) | Refactoring existing test suites, promoting overmocked unit tests, fixing additional test smells, or verifying mutation baselines. |
| [End-to-end testing](docs/testing/e2e-tests.md)              | Writing `*.e2e.test.ts` suites for `Bun.spawn` CLI binaries, stream separation, and signal teardown.                               |
| [Storybook component testing](docs/testing/stories.md)       | Running Vitest portable stories or writing `play()` interaction tests in `apps/frontend`.                                          |
