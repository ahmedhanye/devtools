# Testing standards and contracts

Authoritative testing guide for runtime contracts, boundaries, and workspace test suites across the monorepo.

## Verification boundary: compiler versus automated tests

Compilers and linters verify static structure before test suites execute:

- `tsc --noEmit` verifies types, function signatures, and interface compatibility.
- `fumadocs-mdx` parses frontmatter schemas, validates metadata keys, and checks JSX compilation.
- `next build` verifies static export routes, dynamic imports, and page bundle generation.
- `oxlint` and `eslint` verify syntax correctness, imports, and static code hygiene.
- `steiger` verifies Feature-Sliced Design (FSD) layer import boundaries.

Invariant: if a defect causes `tsc`, `fumadocs-mdx`, or `next build` to fail, do not author an automated test for it.

Automated tests (`bun:test`, `vitest`) strictly verify runtime behavioral contracts:

- Schema parsing, default values, and boundary rejection.
- HTTP status codes, headers, and API payload schemas.
- Error handling, fallback states, and framework boundaries (`notFound()`).
- Process lifecycle, signals, and exit codes.
- Accessible component roles and user interaction events.

## The 5 testing anti-patterns

Never author tests for static copy, document counts, heading strings, utility CSS classes, or trivial variable assignments.

### 1. Static copy and prose assertions

Prose changes during regular content updates and copyediting. Asserting literal copy couples test suites to text strings and verifies no runtime logic.

Bad:

```ts
// Brittle copy assertions fail on routine text edits
it("renders landing page hero text", () => {
  const html = renderToStaticMarkup(React.createElement(HomePage));
  expect(html).toContain("Fast, Unified Developer Workflows");
  expect(html).toContain("loopback daemon");
});
```

Good:

```ts
// Verify semantic landmarks and crash-free rendering
it("renders page semantic landmarks cleanly without throwing", () => {
  const html = renderToStaticMarkup(React.createElement(HomePage));
  expect(html).toContain("<header");
  expect(html).toContain("<main");
  expect(html).toContain("<footer");
});
```

### 2. Document counts and inventory assertions

Collections expand and contract as documentation grows. Asserting arbitrary lengths couples tests to authoring volume rather than software behavior.

Bad:

```ts
// Hardcoded collection count fails when documentation expands
it("loads documentation pages", () => {
  const pages = source.getPages();
  expect(pages.length).toBe(13);
});
```

Good:

```ts
// Verify collection contracts and schema integrity across all items
it("loads documentation pages conforming to page schema", () => {
  const pages = source.getPages();
  expect(Array.isArray(pages)).toBe(true);
  expect(pages.length).toBeGreaterThan(0);

  for (const page of pages) {
    expect(typeof page.url).toBe("string");
    expect(Array.isArray(page.slugs)).toBe(true);
    expect(page.data).toBeDefined();
  }
});
```

### 3. Exact heading and navigation string assertions

Section names and headings change during layout and information architecture revisions. Assert routing and query symmetry instead.

Bad:

```ts
// Asserting exact heading strings couples tests to titles
it("renders section navigation", () => {
  expect(tutorials.children[0].name).toBe("Introduction");
  expect(DOCS_SECTION_TABS.map((t) => t.title)).toContain("Tutorials");
});
```

Good:

```ts
// Verify symmetric lookup between slugs and URLs
it("resolves pages by slug and by url symmetrically", () => {
  const pages = source.getPages();
  const samplePage = pages[0];

  const bySlug = source.getPage(samplePage.slugs);
  expect(bySlug).toBeDefined();
  expect(bySlug?.url).toBe(samplePage.url);

  const byUrl = source.getPageByUrl(samplePage.url);
  expect(byUrl).toBeDefined();
  expect(byUrl?.url).toBe(samplePage.url);
});
```

### 4. Utility CSS class assertions

Utility styling classes are presentation details. Refactoring styles must not break test suites. Assert accessible roles or data slots instead.

Bad:

```ts
// Asserting utility classes couples tests to styling implementation
it("renders diagram layout", () => {
  expect(html).toContain("grid");
  expect(html).toContain("grid-cols-1");
  expect(html).toContain("w-full");
});
```

Good:

```ts
// Assert accessible roles and semantic attributes
it("renders accessible diagram container with figure role and aria-label", () => {
  const html = renderToStaticMarkup(
    React.createElement(Mermaid, {
      chart: "flowchart TD\n  A --> B",
      title: "Architecture Flow",
    }),
  );

  expect(html).toContain('role="figure"');
  expect(html).toContain('aria-label="Architecture Flow"');
});
```

### 5. Trivial variable equality

Asserting that a constant equals its own value tests language assignment rather than system behavior. Assert schema validation and transformations instead.

Bad:

```ts
// Trivial equality checks verify assignment tautologies
it("defines repository constant", () => {
  expect(GITHUB_REPO_URL).toBe("https://github.com/AhmedHanye/devtools");
  expect(API_ERROR_CODES.BAD_REQUEST).toBe("BAD_REQUEST");
  expect(typeof runWebCommand).toBe("function");
});
```

Good:

```ts
// Verify domain schema validation and transformations
it("validates structured error response against domain schema", () => {
  const errorPayload = {
    error: {
      code: API_ERROR_CODES.BAD_REQUEST,
      message: "Invalid query parameter",
    },
  };
  const parsed = ApiErrorResponseSchema.parse(errorPayload);
  expect(parsed).toEqual(errorPayload);
});
```

## Core behavioral testing patterns

### Schema validation at boundaries

Test Zod schemas against valid inputs, boundary limits, invalid types, and unexpected fields:

- Test default resolution: empty input parses to expected defaults.
- Test boundaries: min and max limits (such as port 0 and 65535).
- Test invalid inputs: negative numbers, invalid strings, and malformed dates throw errors.
- Test strictness: unexpected fields throw validation errors when schemas use `.strict()`.

### API response contracts

Test HTTP route handlers through in-memory requests (`app.request`):

- Assert HTTP status codes (200, 403, 404, 405, 500).
- Assert `content-type` response headers.
- Parse JSON response bodies through `@devtools/core` Zod schemas to verify contract conformance.
- Verify CORS loopback origin access controls.

### Error boundaries and failure modes

Test failure behavior across system boundaries:

- Verify invalid slugs trigger Next.js `notFound()` boundaries.
- Verify path traversal attempts return 403.
- Verify unsupported HTTP methods return 405.
- Verify database constraint violations reject duplicate keys.
- Verify CLI processes exit with non-zero codes on port collisions or missing directories.

### Loader query symmetry

In content systems like Fumadocs, verify query invariants:

- Every page in `source.getPages()` resolves by its slug array.
- Resolving by slug returns the same URL as resolving by URL.
- Querying non-existent slugs returns `undefined`.

### Accessible UI interactions

In frontend components, query the DOM using accessible roles:

- Use `screen.getByRole` to find interactive elements (buttons, links, inputs).
- Dispatch user interactions and verify state transitions or callback invocations.
- Use `container.querySelectorAll("[data-slot='...']")` to verify structural loading skeleton slots.
- Do not assert layout classes, visual styling, or static paragraph copy.

## Workspace testing blueprints

### `packages/core` (`@devtools/core`)

- Test runner: `bun:test`
- Scope: Domain models, Zod schemas, configuration defaults, shared constants.
- Test patterns:
  1. Validate `.parse()` output against fixture inputs.
  2. Test default resolution when omitting optional fields.
  3. Test boundary values and range constraints.
  4. Test rejection of invalid types and out-of-range values.
  5. Test `.strict()` rejection of unrecognized keys.

### `packages/db` (`@devtools/db`)

- Test runner: `bun:test`
- Scope: SQLite connections, Drizzle ORM schema, migrations, WAL mode.
- Test patterns:
  1. Test database initialization in memory (`:memory:`) and file paths.
  2. Test migration execution with `runMigrations()` on clean databases.
  3. Test table constraints (foreign keys, uniqueness, not-null constraints).
  4. Test migration idempotency when executed repeatedly.

### `apps/api` (`@devtools/api`)

- Test runner: `bun:test` via Hono `app.request`
- Scope: HTTP routes, JSON serialization, middleware, CORS loopback policy.
- Test patterns:
  1. Test endpoint contracts: status 200, JSON header, and response parsing with `@devtools/core` Zod schemas.
  2. Test error routes: status 404 on missing paths, status 500 on unhandled errors, matching `ApiErrorResponseSchema`.
  3. Test security boundaries: loopback origins (`localhost`, `127.0.0.1`) receive allow-origin headers; external origins receive `null`.
  4. Test route mounting with custom `basePath` configurations.

### `apps/cli` (`@devtools/cli`)

- Test runner: `bun:test`
- Scope: Commander flag parsing, daemon process lifecycle, static file serving.
- Test patterns:
  1. Unit tests: verify flag precedence (CLI argument > environment variable > default).
  2. Integration tests (`daemon.test.ts`): verify `startDaemon()` binds on port 0, serves static files, serves API health, blocks path traversal with 403, and rejects non-GET methods with 405.
  3. Subprocess tests (`cli.test.ts`): spawn daemon via `Bun.spawn`, verify HTTP readiness, verify clean exit 0 on SIGTERM and SIGINT, and verify exit 1 on port conflicts.

### `apps/frontend` (`@devtools/frontend`)

- Test runner: `vitest` with `happy-dom` and `@testing-library/react`
- Scope: Next.js UI, FSD slices, custom React hooks, components.
- Test patterns:
  1. API clients (`shared/api/**`): mock network fetch, verify domain schema parsing, and assert rejection on schema mismatch or non-200 HTTP responses.
  2. Hooks (`*/model/**`): use `renderHook`, test state transitions (`idle` -> `loading` -> `success` / `error`), and test retry handlers.
  3. UI components (`*/ui/**`): use `render` and `screen.getByRole`, test button click handlers, and verify skeleton slots via `[data-slot="skeleton"]`.

### `site` (`@devtools/site`)

- Test runner: `bun:test`
- Scope: Fumadocs loader, catch-all routing, search API, LLM endpoints.
- Test patterns:
  1. Source loader (`smoke.test.ts`): verify `source.getPages()` item contracts, slug-to-URL query symmetry, and `undefined` on missing slugs.
  2. Catch-all route (`docs-shell.test.tsx`): verify `generateStaticParams()` returns slug arrays, `generateMetadata()` returns valid metadata, and non-existent slugs trigger Next.js `notFound()`.
  3. Endpoint routes (`llms-routes.test.ts`, `search-route.test.ts`): verify status 200, `content-type`, structured text format prefixes, and query parameter handling.
