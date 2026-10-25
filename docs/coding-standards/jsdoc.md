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
 * @returns The resolved executable path and detected browser version metadata.
 * @throws {@link BrowserNotFoundError} When no compatible browser executable can be located.
 * @throws {@link InvalidBrowserPathError} When an explicit override path points to an invalid binary.
 *
 * @example
 * ```ts
 * const resolution = await resolveBrowserExecutable({
 *   channel: "stable",
 * });
 * console.log(`Found Chrome at ${resolution.executablePath}`);
 * ```
 */
export async function resolveBrowserExecutable(
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
4. **Explicit exceptions with `@throws`**: Document every custom error class or expected runtime exception callers should anticipate, linking the error symbol using `{@link ErrorClass}` where applicable.
5. **Practical examples with `@example`**: Provide minimal code snippets using fenced markdown blocks (` ```ts `) to demonstrate non-obvious initialization, options passing, or error handling.
