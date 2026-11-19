# JSDoc and TSDoc standards

Conventions for TSDoc blocks, inline comments, linter directives, and tracked `TODO` markers across the monorepo.

## Documentation philosophy

- **Self-documenting code first.** Prefer clear symbol and parameter names over comments that restate identifiers.
- **Document _why_, not _what_.** Capture unwritten conventions, ordering invariants, architectural trade-offs, and failure modes that TypeScript types cannot express.
- **Tiered coverage.** Enforce TSDoc by architectural boundary rather than arbitrary 100% quotas across private helpers or tests.

## Tiered documentation boundaries

| Tier                                                   | Scope                                                                               | Policy                                     | Requirements                                                                                                       |
| :----------------------------------------------------- | :---------------------------------------------------------------------------------- | :----------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| **Tier 1: Public package contracts**                   | `packages/*/src/**` (exported functions, classes, interfaces, schemas)              | **Mandatory**                              | Active-voice summary on line 1, typeless `@param`, `@returns`, `@throws`, `@remarks` for architectural context.    |
| **Tier 2: Programmatic application seams and scripts** | `apps/cli/src/**`, `apps/api/src/**`, `scripts/**/*.ts` (exports)                   | **Mandatory on exports**                   | Active-voice summary, `@param` and `@returns` on non-trivial interfaces, `@throws` where applicable.               |
| **Tier 3: Frontend FSD public slices and utilities**   | `apps/frontend/src/shared/lib/**`, exported slice APIs (`index.ts`)                 | **Mandatory on hooks/utils; opt-in on UI** | Document lifecycle guarantees, hydration safety, and hook parameters; presentational components do not need TSDoc. |
| **Tier 4: Internal helpers, pages, and tests**         | Unexported functions, `apps/frontend/src/{app,pages}/**`, `site/**`, `**/*.test.ts` | **Opt-in for non-obvious logic**           | Any JSDoc block written anywhere must still satisfy valid tag syntax.                                              |

## TSDoc structure and tag rules

```ts
/**
 * Resolves the Chromium executable path using the Browser Resolution Waterfall.
 *
 * @remarks
 * Evaluates explicit overrides, the Managed Browser Cache, then system probes.
 *
 * @param options - Configuration options and injectable probe seams.
 * @returns Resolved executable path, version metadata, and source tier.
 * @throws {@link BrowserNotFoundError} When no compatible browser is found.
 */
```

See `packages/browser/src/waterfall.ts` and `packages/db/src/config.ts` for full examples including `@example` blocks.

- **First-line summary.** Write one concise active-voice sentence on line 1 for IDE hover tooltips.
- **Deep context in `@remarks`.** Move concurrency notes, ordering rules, and rationale into `@remarks`.
- **No duplicate types in `@param`.** Omit `{string}` or `{number}` type braces; separate name and description with a hyphen (`@param channel - Target browser release channel.`).
- **Explicit `@throws`.** Document custom error subclasses callers handle using `{@link ErrorClass}`.

## Inline comment standards

- **No commented-out code or tests.** Delete unused code (Git preserves history). Use `it.todo("...")` or `it.skip(...)` with a reason instead of commenting out test blocks.
- **Actionable directives.** Never use `@ts-ignore` or `@ts-nocheck`. Pair `@ts-expect-error` with an explanation of at least 10 characters, and include the exact rule name and rationale on any `oxlint-disable-next-line` directive:
  ```ts
  // oxlint-disable-next-line no-await-in-loop -- sequential waterfall probe order required
  ```
- **Fake test secrets.** Annotate intentional fake credentials strictly with `// trufflehog:ignore` (or `# trufflehog:ignore` in `#`-comment files).
- **Tracked `TODO` / `FIXME`.** Scope every marker to a tracking issue (`// TODO(#123): ...`).
