# JSDoc and TSDoc Standards

Conventions for documenting TypeScript code, functions, types, and module interfaces across the monorepo.

## Documentation philosophy

1. **Self-documenting code first**: Names of functions, variables, and parameters should clearly state their intent. Do not write comments that merely restate identifiers in prose:
   ```ts
   // Bad: redundant trivial comment
   /**
    * The user ID.
    */
   const userId: string;
   ```
2. **Document the _why_, not the _what_**: Comments earn their place by capturing unwritten conventions, architectural rationale, non-obvious trade-offs, and invariants that the type system cannot express.
3. **Avoid arbitrary 100% docstring quotas**: Universal docstring quotas across every internal function, React component, or test closure lead to LLM comment slop and comment rot. Instead, enforce a strict **Tiered Documentation Boundary**.

## Tiered documentation boundaries

Documentation requirements are strictly scoped by architectural layer and export visibility:

| Tier                                                      | Scope                                                                               | Coverage Policy                                  | Requirements                                                                                                                       |
| :-------------------------------------------------------- | :---------------------------------------------------------------------------------- | :----------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| **Tier 1: Public Package Contracts**                      | `packages/*/src/**` (exported functions, classes, interfaces, schemas)              | **Mandatory**                                    | First-line active-voice summary, `@param` (no `{type}`), `@returns`, `@throws` on errors, `@remarks` for architectural context.    |
| **Tier 2: Programmatic Application Seams & Scripts**      | `apps/cli/src/**`, `apps/api/src/**`, `scripts/*.ts` (exported functions & schemas) | **Mandatory on exports**                         | Active-voice summary, `@param` and `@returns` for non-trivial interfaces, `@throws` where applicable.                              |
| **Tier 3: Frontend FSD Public Slices & Shared Utilities** | `apps/frontend/src/shared/lib/**`, exported slice APIs (`index.ts`)                 | **Mandatory on hooks/utilities; Optional on UI** | Document lifecycle guarantees, hydration safety, and hook parameters. Presentational React components do not require TSDoc blocks. |
| **Tier 4: Internal Helpers, Pages, and Tests**            | Unexported functions, `apps/frontend/src/{app,pages}/**`, `site/**`, `**/*.test.ts` | **Opt-in only for non-obvious logic**            | Self-documenting code is preferred. However, **any** JSDoc comment written anywhere must satisfy 100% tag and syntax validation.   |

## TSDoc structure and formatting

Document exported functions, interfaces, schemas, and complex module seams using standard TSDoc blocks:

````ts
/**
 * Resolves the Chromium browser executable path using the resolution waterfall.
 *
 * @remarks
 * Probes candidate locations in order: explicit environment overrides, the local
 * managed cache (~/.devtools/browsers/), and system executable probes. If no
 * compatible executable is discovered, an actionable remediation error is raised.
 *
 * @param options - Configuration options and optional dependency injection seams.
 * @returns The resolved executable path, detected browser version metadata, and source.
 * @throws {@link BrowserNotFoundError} When no compatible browser executable can be located.
 * @throws {@link InvalidBrowserPathError} When an explicit override path points to an invalid binary.
 *
 * @example
 * ```ts
 * const resolution = await resolveBrowserPath({
 *   chromePath: "/usr/bin/google-chrome",
 * });
 * console.log(`Found Chrome at ${resolution.executablePath}`);
 * ```
 */
export async function resolveBrowserPath(
  options: ResolveBrowserOptions = {},
): Promise<BrowserResolution> {
  // ...
}
````

## Key tag rules

1. **First-line summary**: The opening line of a doc block must be a concise, single-sentence summary written in active voice. IDE hover tooltips display this line first.
2. **Deep context in `@remarks`**: Lengthy explanations, concurrency caveats, ordering requirements, and architectural context belong in an `@remarks` block following the summary.
3. **No redundant types in `@param`**: TypeScript already declares parameter types. Never duplicate type expressions in JSDoc/TSDoc parameter annotations:
   - **Bad**: `@param {string} channel - The release channel`
   - **Good**: `@param channel - Target browser release channel (stable, beta, dev, canary).`
4. **Hyphen separator convention**: Follow `@param <name> - <description>` with a hyphen separating the parameter name from its prose explanation.
5. **Explicit exceptions with `@throws`**: Document every custom error class or expected runtime exception callers should anticipate, linking the error symbol using `{@link ErrorClass}` where applicable.
6. **Practical examples with `@example`**: Provide minimal code snippets using fenced markdown blocks (` ```ts `) to demonstrate non-obvious initialization, options passing, or error handling.

## Code comment standards (`//` and `/* */`)

Non-JSDoc code comments must adhere to strict hygiene standards across all workspaces:

1. **No commented-out code**: Do not leave abandoned code blocks or commented-out function definitions in the repository. Rely on Git version history for code retrieval.
2. **Ban commented-out tests**: Never comment out test blocks (`// it("...")`). Use `it.todo("...")` to document pending coverage or skip with an explicit rationale (`it.skip(...)`).
3. **Actionable compiler and linter directives**:
   - Strictly forbid blanket `@ts-ignore` and `@ts-nocheck`.
   - Use `@ts-expect-error` only with an accompanying explanation of at least 10 characters:
     ```ts
     // @ts-expect-error: dynamic property access verified by upstream schema guard
     ```
   - Linter disables must always document the specific rule and rationale:
     ```ts
     // oxlint-disable-next-line no-await-in-loop -- sequential probe execution required by waterfall
     ```
4. **Secret scanner directives**: Fake credentials in unit tests must append the required comment syntax per repository rules:
   - Append `// trufflehog:ignore` in `//`-comment files.
   - Append `# trufflehog:ignore` in `#`-comment files.
5. **Tracked `TODO` and `FIXME` comments**: Avoid untracked orphan `TODO` comments. Always prefix `TODO` or `FIXME` comments with a tracked issue number or bounded scope:
   ```ts
   // TODO(#123): extract waterfall probe cache into shared persistence adapter
   ```
