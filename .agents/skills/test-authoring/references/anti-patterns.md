# Testing anti-patterns

Prohibited testing practices and compliant alternatives across monorepo workspaces.

## Static compiler boundary

Compilers and linters verify static structure before test suites execute:

- `tsc --noEmit` verifies types, function signatures, and interface compatibility.
- `fumadocs-mdx` validates frontmatter schemas and JSX compilation.
- `next build` verifies static routes and page bundles.
- `oxlint` and `eslint` verify static code hygiene.
- `steiger` verifies Feature-Sliced Design layer boundaries.

Never author automated tests for errors or conditions that compilers and linters already prevent.

## 1. Static copy and prose assertions

Prose changes during regular content updates and copyediting. Asserting literal copy couples test suites to text strings and verifies no runtime logic.

### Bad

```ts
// Brittle copy assertions fail on routine text edits
it("renders landing page hero text", () => {
  const html = renderToStaticMarkup(React.createElement(HomePage));
  expect(html).toContain("Fast, Unified Developer Workflows");
  expect(html).toContain("loopback daemon");
});
```

### Good

```ts
// Verify semantic landmarks and crash-free rendering
it("renders page semantic landmarks cleanly without throwing", () => {
  const html = renderToStaticMarkup(React.createElement(HomePage));
  expect(html).toContain("<header");
  expect(html).toContain("<main");
  expect(html).toContain("<footer");
});
```

## 2. Document counts and inventory assertions

Collections expand and contract as documentation grows. Asserting arbitrary lengths couples tests to authoring volume rather than software behavior.

### Bad

```ts
// Hardcoded collection count fails when documentation expands
it("loads documentation pages", () => {
  const pages = source.getPages();
  expect(pages.length).toBe(13);
});
```

### Good

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

## 3. Exact heading and navigation string assertions

Section names and headings change during layout and information architecture revisions. Assert routing and query symmetry instead.

### Bad

```ts
// Asserting exact heading strings couples tests to titles
it("renders section navigation", () => {
  expect(tutorials.children[0].name).toBe("Introduction");
  expect(DOCS_SECTION_TABS.map((t) => t.title)).toContain("Tutorials");
});
```

### Good

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

## 4. Utility CSS class assertions

Utility styling classes are presentation details. Refactoring styles must not break test suites. Assert accessible roles or data slots instead.

### Bad

```ts
// Asserting utility classes couples tests to styling implementation
it("renders diagram layout", () => {
  expect(html).toContain("grid");
  expect(html).toContain("grid-cols-1");
  expect(html).toContain("w-full");
});
```

### Good

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

## 5. Trivial variable equality

Asserting that a constant equals its own value tests language assignment rather than system behavior. Assert schema validation and transformations instead.

### Bad

```ts
// Trivial equality checks verify assignment tautologies
it("defines repository constant", () => {
  expect(GITHUB_REPO_URL).toBe("https://github.com/AhmedHanye/devtools");
  expect(API_ERROR_CODES.BAD_REQUEST).toBe("BAD_REQUEST");
  expect(typeof runWebCommand).toBe("function");
});
```

### Good

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
