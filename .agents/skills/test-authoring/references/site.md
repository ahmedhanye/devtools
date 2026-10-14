# Site platform testing

Testing contracts and patterns for `site` (`@devtools/site`).

- **Runner**: `bun:test`
- **Scope**: Fumadocs loader, catch-all documentation routes, search API, LLM text endpoints.

## Patterns

1. **Loader query symmetry (`smoke.test.ts`)**: In content systems using Fumadocs, verify query invariants:
   - Every page returned by `source.getPages()` resolves by its slug array.
   - Resolving by slug produces the identical URL as resolving by URL.
   - Querying non-existent slugs returns `undefined`.
2. **Catch-all route contracts (`docs-shell.test.tsx`)**:
   - Verify `generateStaticParams()` returns array of slug parameters.
   - Verify `generateMetadata()` returns valid title and description objects.
   - Verify missing slugs trigger Next.js `notFound()` framework boundary without throwing unhandled exceptions.
3. **Endpoint routes (`llms-routes.test.ts`, `search-route.test.ts`)**:
   - Verify HTTP status 200 and expected `content-type` response headers.
   - Verify payload prefixes for plain text formats (`# Monorepo Documentation`).
   - Verify search endpoint query parameter filtering and empty query handling.

## Example

```ts
import { describe, expect, it } from "bun:test";
import { source } from "../src/lib/source";

describe("Fumadocs source loader symmetry", () => {
  it("resolves all pages by slug and url symmetrically", () => {
    const pages = source.getPages();
    expect(pages.length).toBeGreaterThan(0);

    for (const page of pages) {
      const bySlug = source.getPage(page.slugs);
      expect(bySlug).toBeDefined();
      expect(bySlug?.url).toBe(page.url);

      const byUrl = source.getPageByUrl(page.url);
      expect(byUrl).toBeDefined();
      expect(byUrl?.url).toBe(page.url);
    }
  });

  it("returns undefined for non-existent slugs", () => {
    const missing = source.getPage(["non-existent", "unknown-slug"]);
    expect(missing).toBeUndefined();
  });
});
```
