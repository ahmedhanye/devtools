# Monorepo Testing Standards

Testing philosophy, behavioral contracts, prohibited anti-patterns, and hermetic execution primitives across all monorepo workspaces.

## Testing philosophy and compiler boundaries

Compilers and linters verify static structure before test suites execute:

- `tsc --noEmit` verifies types, function signatures, and interface compatibility.
- `oxlint` verifies static code hygiene and forbidden imports.
- `steiger` verifies Feature-Sliced Design layer boundaries.

**Core rule**: Never author automated tests for conditions that compilers, linters, or type systems already guarantee. Automated test suites verify **observable runtime behaviors**, schema boundaries, state transitions, and error handling.

## Prohibited testing anti-patterns

Avoid these five testing anti-patterns across all workspaces:

### 1. Static copy and prose assertions

Asserting literal text strings couples test suites to copyediting changes and asserts zero computational logic.

- **Bad**:
  ```ts
  it("renders landing page hero text", () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain("Fast, Unified Developer Workflows");
  });
  ```
- **Good**:
  ```ts
  it("renders page semantic landmarks cleanly without throwing", () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain("<header");
    expect(html).toContain("<main");
    expect(html).toContain("<footer");
  });
  ```

### 2. Document counts and collection length assertions

Asserting hardcoded array lengths couples tests to content volume rather than data integrity.

- **Bad**:
  ```ts
  it("loads documentation pages", () => {
    const pages = source.getPages();
    expect(pages.length).toBe(13); // Fails whenever a new doc page is added
  });
  ```
- **Good**:
  ```ts
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

Section titles and navigation links change during information architecture updates. Assert query symmetry or slug resolution instead.

- **Bad**:
  ```ts
  it("renders section navigation", () => {
    expect(nav.items[0].title).toBe("Introduction");
  });
  ```
- **Good**:
  ```ts
  it("resolves pages by slug and url symmetrically", () => {
    const samplePage = source.getPages()[0];
    const bySlug = source.getPage(samplePage.slugs);
    const byUrl = source.getPageByUrl(samplePage.url);

    expect(bySlug?.url).toBe(samplePage.url);
    expect(byUrl?.url).toBe(samplePage.url);
  });
  ```

### 4. Utility CSS class assertions

Utility styling classes are transient presentation details. Assert accessible ARIA roles, semantic HTML tags, or data attributes instead.

- **Bad**:
  ```ts
  it("renders button styling", () => {
    expect(html).toContain("bg-primary");
    expect(html).toContain("px-4");
  });
  ```
- **Good**:
  ```ts
  it("renders accessible button with accessible name", () => {
    render(<ActionButton label="Deploy Service" onAction={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Deploy Service" });
    expect(button).toBeInTheDocument();
  });
  ```

### 5. Trivial variable equality assertions

Asserting that a constant equals its assigned literal tests language assignment rather than system behavior.

- **Bad**:
  ```ts
  it("defines repository constants", () => {
    expect(API_ERROR_CODES.BAD_REQUEST).toBe("BAD_REQUEST");
    expect(typeof runWebCommand).toBe("function");
  });
  ```
- **Good**:
  ```ts
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

## Hermetic testing primitives

Test suites must execute concurrently and deterministically without cross-test pollution or dependence on machine-specific state:

1. **Ephemeral ports (`port: 0`)**: Server and daemon integration tests must bind to ephemeral port `0` (`startDaemon({ port: 0 })`). The operating system assigns a free socket, preventing port collisions in concurrent test runs.
2. **In-memory SQLite (`:memory:`)**: Database tests use in-memory SQLite databases (`url: ":memory:"`) to guarantee isolation, eliminate disk cleanup steps, and prevent database locking errors.
3. **Socketless HTTP testing**: Test Hono API endpoints in-memory using `app.request()` rather than spinning up live TCP servers.
4. **Dependency injection seams**: Test external boundary logic (such as browser file probes or network downloads) by injecting mock seams into functions rather than executing live external network calls.

## Workspace testing patterns

- **`packages/core` (`bun:test`)**: Validate Zod schema bounds, `.strict()` rejection of unrecognized properties, and default value resolution.
- **`packages/db` (`bun:test`)**: Verify migration idempotency (running `runMigrations` multiple times succeeds cleanly) and database constraint enforcement.
- **`apps/cli` (`bun:test`)**: Verify command flag precedence (CLI flags > environment variables > config defaults), route guards (HTTP 403 on directory traversal attempts), and clean signal termination (`SIGTERM`/`SIGINT`).
- **`apps/frontend` (`vitest` with `happy-dom` & `@testing-library/react`)**: Verify asynchronous hook state transitions (`idle` -> `loading` -> `success`), accessible element interactions (`screen.getByRole`), and skeleton slot rendering (`data-slot="skeleton"`).
- **`site` (`bun:test`)**: Verify Fumadocs page loader query symmetry (`source.getPages()`), catch-all route metadata generation, and search route filtering.
