# DevTools Coding Standards

Engineering baselines, architectural contracts, and code quality standards across the DevTools monorepo.

## Core engineering invariants

All contributions across applications and packages must adhere to these foundational principles:

1. **Strict TypeScript baselines**: Workspaces inherit strict compiler checks (`strict: true`, `noUncheckedIndexedAccess: true`). Accessing indexable collections requires explicit bounds checking. Ban arbitrary `any`.
2. **Schema-first boundary contracts**: Validate all data crossing boundaries (network, filesystem, CLI args, database rows) through Zod schemas. Derive TypeScript types using `z.infer<typeof Schema>`.
3. **Headless package isolation**: Internal packages (`packages/*`) must never import from deployable applications (`apps/*`) or documentation (`site/`). Packages expose direct source exports (`"exports": "./src/index.ts"`) for zero-build development.
4. **Environment seam discipline**: Domain logic must never read `process.env` directly. Centralize environment variable reads into a package `config.ts` module with injectable `env?: Record<string, string | undefined>` seams per [ADR 0002](docs/adr/0002-package-configuration-and-environment-seams.md). Code branching on runtime environment state (`isTTY`, `process.getuid`, OS platform) must expose injectable option parameters so all branches are exercised in unit tests to satisfy 100% diff coverage.
5. **Ergonomic CLI tools**: Follow [Command Line Interface Guidelines (CLIG)](https://clig.dev/): separate `stdout` (data) from `stderr` (logs), provide `--json` for machine consumption, support `NO_COLOR`, and deliver actionable remediation steps in error messages.
6. **Hono API standards**: Serve API endpoints in-process on `/api/*` using Hono. Validate all inputs with Zod and format non-2xx payloads using standardized JSON error envelopes.
7. **Feature-Sliced Design v2.1**: Organize `apps/frontend` strictly by FSD layers (`app` -> `pages` -> `features` -> `entities` -> `shared`). Apply the "pages first" rule, keep App Router entrypoints thin, use React 19 native ref props, and use semantic theme tokens.
8. **Behavioral runtime testing**: Assert dynamic runtime behavior, schema validation, and error states. Never test compiler invariants, CSS utility classes, arbitrary collection lengths, or static copy. Keep test execution hermetic with ephemeral ports (`port: 0`) and in-memory SQLite (`:memory:`).
9. **TSDoc documentation**: Document exported contracts with an active-voice summary on line 1, architectural context in `@remarks`, parameter intent in `@param` (without duplicate types), and expected failure modes in `@throws`.

## Standards directory

Detailed domain standards live under `docs/coding-standards/`:

- [TypeScript standards](docs/coding-standards/typescript.md): Language-level strictness, error causes, Zod schema contracts, and type hygiene.
- [Monorepo package standards](docs/coding-standards/packages.md): Unidirectional dependencies, direct source exports, centralized configuration seams, and deep module design.
- [CLI tool standards](docs/coding-standards/cli.md): Output streams (`stdout`/`stderr`), `--json` formatting, flag conventions, actionable errors, and programmatic library seams.
- [HTTP API standards](docs/coding-standards/api.md): Hono architecture, loopback security, standardized error responses, and in-memory testing.
- [Frontend application standards](docs/coding-standards/frontend.md): Feature-Sliced Design v2.1 layers, Next.js App Router boundary adapters, React 19 standards, and hydration safety.
- [Testing standards](docs/coding-standards/testing.md): Behavioral assertions, prohibited testing anti-patterns, hermetic test resources, and workspace test suites.
- [JSDoc and TSDoc standards](docs/coding-standards/jsdoc.md): Formatting conventions, `@remarks` context, clean `@param` tags, and `@throws` declarations.

## Architecture and domain pointers

- [System Architecture](ARCHITECTURE.md): Monorepo topology, component diagrams, runtime lifecycles, and architecture directory.
- [Contributing Guide](CONTRIBUTING.md): Git branching, issue tracking, commit messages, and release procedures.
- [Domain Glossary Map](GLOSSARY-MAP.md): Canonical domain vocabularies across bounded contexts.
- [Architecture Decision Records](docs/adr/README.md): Historical records of architectural decisions and rationale.

## Authoring and review checklist

Before submitting changes or approving pull requests, verify compliance against this checklist:

- [ ] New data crossing process, network, or storage boundaries is validated by a Zod schema.
- [ ] No ambient `process.env` lookups exist outside of designated `config.ts` seams.
- [ ] Internal packages expose source files directly via `exports` without requiring intermediate builds.
- [ ] CLI commands route logs to `stderr`, data to `stdout`, and support `--json` where state is queried.
- [ ] Frontend additions adhere to FSD v2.1 layer hierarchy and lowercase `kebab-case` naming.
- [ ] Tests verify observable runtime contracts and error states rather than static types or utility CSS classes.
- [ ] Public functions and types include TSDoc annotations documenting purpose, parameters, and `@throws`.
