# Integration testing

Guidelines and patterns for writing gray-box integration tests (`*.integration.test.ts` via `test:integration`) across module seams, socketless Hono HTTP routes, loopback daemons, in-memory SQLite databases, cross-package adapters, and documentation loaders. See [`TESTING.md`](../../TESTING.md) and [`box-testing.md`](box-testing.md) for workspace mappings.

## 1. Socketless HTTP route and middleware testing (`apps/api`)

Instantiate isolated Hono applications using `createApp()` from `apps/api/src/index.ts` and execute requests in memory with `app.request()`. Do not bind TCP ports when testing route handlers, CORS headers, loopback protection, or error envelopes:

```ts
import { describe, expect, it } from "bun:test";
import {
  API_ERROR_CODES,
  ApiErrorResponseSchema,
  HealthResponseSchema,
} from "@devtools/core";
import { createApp } from "../src";

describe("Hono API routes and security middleware", () => {
  it("returns 200 and schema-valid health payload on GET /api/health", async () => {
    const app = createApp();
    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    const parsed = HealthResponseSchema.parse(await res.json());
    expect(parsed.status).toBe("ok");
  });

  it("rejects mutating requests with non-loopback Origin with 403 FORBIDDEN error envelope", async () => {
    const app = createApp();
    const res = await app.request("/api/health", {
      method: "POST",
      headers: {
        Origin: "http://evil.example.com",
      },
    });

    expect(res.status).toBe(403);
    const parsed = ApiErrorResponseSchema.parse(await res.json());
    expect(parsed.error.code).toBe(API_ERROR_CODES.FORBIDDEN);
  });

  it("returns 404 NOT_FOUND envelope on unknown routes", async () => {
    const app = createApp();
    const res = await app.request("/api/nonexistent");

    expect(res.status).toBe(404);
    const parsed = ApiErrorResponseSchema.parse(await res.json());
    expect(parsed.error.code).toBe(API_ERROR_CODES.NOT_FOUND);
  });
});
```

## 2. Ephemeral loopback daemon testing (`apps/cli`)

When testing the unified loopback daemon (`startDaemon` in `apps/cli/src/daemon.ts`), pass `port: 0` so the OS assigns an unused ephemeral port. Always stop the daemon and reset the database singleton in `afterEach`:

```ts
import { afterEach, describe, expect, it } from "bun:test";
import { HealthResponseSchema } from "@devtools/core";
import { resetDb } from "@devtools/db";
import { type DaemonInstance, startDaemon } from "../src/daemon";

describe("Loopback daemon lifecycle", () => {
  let activeDaemon: DaemonInstance | null = null;

  afterEach(async () => {
    if (activeDaemon) {
      await activeDaemon.stop();
      activeDaemon = null;
    }
    resetDb();
  });

  it("boots on ephemeral port 0 and serves both static HTML and /api/health", async () => {
    activeDaemon = startDaemon({ port: 0, host: "127.0.0.1" });
    expect(activeDaemon.port).toBeGreaterThan(0);

    const baseUrl = `http://127.0.0.1:${activeDaemon.port}`;

    const htmlRes = await fetch(`${baseUrl}/`);
    expect(htmlRes.status).toBe(200);
    expect(await htmlRes.text()).toContain("<!DOCTYPE html>");

    const apiRes = await fetch(`${baseUrl}/api/health`);
    expect(apiRes.status).toBe(200);
    expect(HealthResponseSchema.parse(await apiRes.json()).status).toBe("ok");
  });
});
```

## 3. In-memory SQLite persistence and migrations (`packages/db`)

Run persistence integration tests against `:memory:` SQLite instances via `createSqliteConnection({ path: ":memory:" })`, `createDb({ connection })`, and `runMigrations(db)`. Verify migration idempotency and transaction rollbacks:

```ts
import { describe, expect, it } from "bun:test";
import {
  createDb,
  createSqliteConnection,
  eq,
  runMigrations,
  systemMetadata,
} from "../src";

describe("SQLite migrations and persistence invariants", () => {
  it("applies migrations idempotently on an in-memory database", () => {
    const sqlite = createSqliteConnection({ path: ":memory:" });
    const testDb = createDb({ connection: sqlite });
    try {
      expect(() => runMigrations(testDb)).not.toThrow();
      expect(() => runMigrations(testDb)).not.toThrow();

      const rows = testDb.select().from(systemMetadata).all();
      expect(Array.isArray(rows)).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it("rolls back all writes when a transaction throws", () => {
    const sqlite = createSqliteConnection({ path: ":memory:" });
    const testDb = createDb({ connection: sqlite });
    try {
      runMigrations(testDb);

      expect(() => {
        testDb.transaction((tx) => {
          tx.insert(systemMetadata)
            .values({ key: "schema_check", value: "v1", updatedAt: new Date() })
            .run();
          throw new Error("Abort transaction");
        });
      }).toThrow("Abort transaction");

      const found = testDb
        .select()
        .from(systemMetadata)
        .where(eq(systemMetadata.key, "schema_check"))
        .all();
      expect(found).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });
});
```

## 4. Cross-package adapter and repository seams (`packages/browser`, `packages/lighthouse`)

- **Injectable process and network seams.** In `packages/browser` (`detector.ts`, `installer.ts`) and `packages/lighthouse` (`runner.ts`), inject fake process spawners or HTTP fetchers at the adapter seam rather than downloading headless browser archives or launching real Chrome processes in integration tests.
- **Repository round-trips.** Test `LighthouseRepository` against a migrated `:memory:` database to verify that parent run rows, category scores, core metrics, and diagnostic items persist and cascade-delete accurately.

## 5. Documentation site routes and loaders (`site`)

Verify Fumadocs query symmetry (`source.getPage` vs `source.getPageByUrl`), `/llms.txt` and `/api/search` route handlers, and server-rendered layout landmarks (`<header`, `<main`, `<nav`) in `site/tests/`:

```tsx
import { describe, expect, it } from "bun:test";
import { source } from "../src/lib/source";

describe("Fumadocs loader query symmetry", () => {
  it("resolves identical page references by slug array and URL path", () => {
    const pages = source.getPages();
    expect(pages.length).toBeGreaterThan(0);

    for (const page of pages) {
      const bySlug = source.getPage(page.slugs);
      const byUrl = source.getPageByUrl(page.url);
      expect(bySlug?.url).toBe(page.url);
      expect(byUrl?.url).toBe(page.url);
    }
  });
});
```
