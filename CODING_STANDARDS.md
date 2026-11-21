# DevTools coding standards

Engineering baselines, authoring rules, and review checklists across the DevTools monorepo.

## Core engineering invariants

1. **Strict TypeScript baselines.** Workspaces inherit strict compiler checks (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`). Guard all indexed accesses and ban `any` and unsafe narrowing assertions.
2. **Schema-first boundary contracts.** Validate data crossing process, network, CLI, filesystem, or database boundaries with Zod schemas, deriving types via `z.infer<typeof Schema>`.
3. **Headless package isolation.** Internal packages (`packages/*`) never import from `apps/*` or `site/` and expose direct TypeScript source exports via `package.json` `exports`.
4. **Configuration seam discipline.** Never read `process.env` directly inside domain logic. Centralize environment lookups in package `config.ts` modules with injectable `options.env` configuration seams per [Monorepo package standards](docs/coding-standards/packages.md), and expose injectable seams for runtime environment branches (`isTTY`, `process.getuid`, platform) to satisfy 100% diff coverage.
5. **Ergonomic CLI tools.** Follow [Command Line Interface Guidelines (CLIG)](https://clig.dev/): separate `stdout` (data) from `stderr` (logs), provide `--json` for query commands, honor `NO_COLOR`, and emit actionable remediation errors.
6. **Hono API standards.** Serve `/api/*` endpoints through the `createApp()` factory, validate inputs with Zod, and return `ApiErrorResponseSchema` envelopes on non-2xx responses.
7. **Feature-Sliced Design v2.1.** Structure `apps/frontend` top-down (`app` -> `pages` -> `features` -> `entities` -> `shared`), follow the pages-first extraction rule, use React 19 native `ref` props, and use semantic theme tokens.
8. **Behavioral runtime testing.** Assert observable runtime behavior, schema contracts, and failure states using hermetic resources (`port: 0`, `:memory:`).
9. **Tiered TSDoc documentation.** Document public package exports and application seams with an active-voice summary, `@remarks`, typeless `@param`, and `@throws`.

## Standards directory

| Guide                                                           | Read when                                                                                          |
| :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| [TypeScript standards](docs/coding-standards/typescript.md)     | Writing TypeScript types, Zod schemas, imports, or error classes.                                  |
| [Monorepo package standards](docs/coding-standards/packages.md) | Creating or editing `packages/*`, direct exports, configuration seams, or telemetry suppression.   |
| [CLI tool standards](docs/coding-standards/cli.md)              | Building CLI commands, flags, streams, programmatic CLI seams, or signal teardown in `apps/cli`.   |
| [HTTP API standards](docs/coding-standards/api.md)              | Authoring Hono routes, factories, Zod validation, or error envelopes in `apps/api`.                |
| [Frontend standards](docs/coding-standards/frontend.md)         | Authoring FSD slices, Storybook stories, React 19 components, or browser hooks in `apps/frontend`. |
| [JSDoc and TSDoc standards](docs/coding-standards/jsdoc.md)     | Writing TSDoc blocks, inline comments, linter directives, or `TODO` markers.                       |
| [Testing standards](TESTING.md)                                 | Writing or reviewing unit, integration, E2E, or Storybook tests.                                   |

## Related references

- [System architecture](ARCHITECTURE.md) and [Architecture decision records](ARCHITECTURE.md#architecture-decision-records)
- [Contributing guide](CONTRIBUTING.md)
- [Domain glossary](GLOSSARY.md)

## Authoring and review checklist

- [ ] Data crossing process, network, or storage boundaries is validated by a Zod schema.
- [ ] No ambient `process.env` lookups exist outside designated `config.ts` configuration seams.
- [ ] Internal packages expose direct source exports without intermediate builds.
- [ ] CLI commands route logs to `stderr`, data to `stdout`, and support `--json` for state queries.
- [ ] Frontend changes follow FSD v2.1 layer order, pages-first extraction rule, and lowercase `kebab-case` naming.
- [ ] Tests verify observable runtime contracts and error states rather than static copy or utility CSS classes.
- [ ] Public package functions and types include TSDoc summarizing intent, parameters, and `@throws`.
