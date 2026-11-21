# Integration testing

Patterns for authoring gray-box integration tests (`*.integration.test.ts` via `test:integration`) across socketless Hono routes, ephemeral Daemons, `:memory:` SQLite stores, and cross-package adapter seams. See [`TESTING.md`](../../TESTING.md) and [`box-testing.md`](box-testing.md) for workspace mappings and wire-probe rules.

## 1. Socketless HTTP routes and security middleware (`apps/api`)

Instantiate isolated apps via `createApp()` from `apps/api/src/index.ts` and invoke `app.request()` directly in memory without binding TCP ports. Validate all payloads with Zod (`HealthResponseSchema`, `ApiErrorResponseSchema`, `@devtools/lighthouse/schemas`):

```ts
const app = createApp();
const res = await app.request("/api/health");
expect(res.status).toBe(200);
expect(HealthResponseSchema.parse(await res.json()).status).toBe("ok");
```

- **Reference suites:** `apps/api/tests/health.integration.test.ts`, `apps/api/tests/lighthouse.integration.test.ts`, `apps/api/tests/lighthouse-sse.integration.test.ts`, `apps/api/tests/server.integration.test.ts`.

## 2. Ephemeral Daemon lifecycle (`apps/cli`)

Start the Daemon via `startDaemon({ port: 0, host: "127.0.0.1" })` so the OS assigns a free ephemeral port (`daemon.port`), and always call `await activeDaemon.stop()` in `afterEach`:

```ts
afterEach(async () => {
  await activeDaemon?.stop();
  activeDaemon = null;
});
```

- **Reference suites:** `apps/cli/tests/daemon.integration.test.ts`, `apps/cli/tests/lighthouse.integration.test.ts`.

## 3. In-memory SQLite Database Handles (`packages/db`)

Use `using handle = openDb({ memory: true })` to verify Lazy Schema Initialization, rollback on throwing `handle.write()` transactions, nested savepoints, and handle disposal with zero disk side effects:

```ts
using handle = openDb({ memory: true });
expect(() =>
  handle.write((tx) => {
    tx.insert(systemMetadata)
      .values({ key: "k", value: "v", updatedAt: new Date() })
      .run();
    throw new Error("Abort");
  }),
).toThrow("Abort");

const row = handle.read((db) =>
  db.select().from(systemMetadata).where(eq(systemMetadata.key, "k")).get(),
);
expect(row).toBeUndefined();
```

- **Reference suite:** `packages/db/tests/db.integration.test.ts`.

## 4. Cross-package adapter and store seams (`packages/browser`, `packages/lighthouse`)

- **Injectable external seams.** Inject fake probes, HTTP fetchers, or Chrome launch/iteration ports at adapter boundaries (`packages/browser/src/detector.ts`, `packages/browser/src/installer.ts`, `packages/lighthouse/src/application/execute-batch.ts`, `packages/lighthouse/src/infra/runtime/iteration.ts`) rather than downloading browser archives or launching real Chrome during integration runs.
- **Store round-trips.** Exercise `createLighthouseStore({ db, artifactsDir })` over `using db = openDb({ memory: true })` (`insertRun`, `getRun`, `listRunsWithTotal`, `diffRuns`, `resolveReportHtmlPath`, `persistBatch`) against an isolated `:memory:` database and temporary `artifactsDir` to verify short-ID prefix range lookups, warm Audit Summaries, and cold Report Artifact rollback on failure.
- **Reference suites:** `packages/browser/tests/detector.integration.test.ts`, `packages/browser/tests/installer.integration.test.ts`, `packages/lighthouse/tests/runner.integration.test.ts`, `packages/lighthouse/tests/runs.integration.test.ts`.
