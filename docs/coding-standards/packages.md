# Monorepo package standards

Authoring rules, direct source exports, Configuration Seams, and workspace scaffolding conventions for shared domain packages under `packages/*`.

## Headless domain isolation

For workspace dependency topology and enforced `.fallowrc.json` zones, see [Monorepo architecture](../architecture/monorepo.md#dependency-boundaries). When authoring inside `packages/*`:

- **Framework independence.** Keep packages free of React, Next.js, and Hono. Domain models and logic remain independent of UI and HTTP delivery layers.
- **No internal process orchestration.** Packages are programmatic libraries, not process supervisors. Do not spawn worker scripts (`Bun.spawn`) to manage internal control flow; leave job concurrency and supervision to `apps/api` and `apps/cli` per [ADR 0005](../adr/0005-in-process-lighthouse-execution.md).
- **Direct source exports.** Declare direct TypeScript entrypoints in `package.json` `exports` (`"."`, `"./node"`, `"./schema"`, `"./schemas"`) pointing to `./src/*.ts` rather than `dist/`. Consuming workspaces import only public subpath exports, never internal paths such as `@devtools/db/src/client`.

## Configuration seams

> [!IMPORTANT]
> Oxlint denies `node/no-process-env` across `packages/**/src/**`, allowing `process.env` reads exclusively inside designated `config.ts` and `config/artifacts-config.ts` modules.

Centralize environment resolution into one configuration module per package and accept an injectable `options.env` Configuration Seam:

```ts
export interface ResolveConfigOptions {
  env?: EnvMap;
  cwd?: () => string;
  isStandalone?: boolean;
}
```

See `packages/db/src/config.ts`, `packages/browser/src/config.ts`, and `packages/lighthouse/src/config/artifacts-config.ts` for canonical implementations.

## Deep modules

- **Minimal public surface.** Hide internal complexity (connection pooling, WAL retries, Chromium probes) behind a small, stable exported API.
- **Purposeful seams.** Add injectable dependency seams only where testing or real runtime variation requires them. Avoid single-use speculative abstractions.

## Workspace package scaffolding

When adding or removing a workspace under `apps/*` or `packages/*`:

1. **Review boundaries.** Update `.coderabbit.yaml` (`reviews.path_instructions`) with domain review contracts.
2. **Architecture zones.** Update `.fallowrc.json` import rules if the workspace adds or changes dependency layers.
3. **TypeScript config.** Extend `../../tsconfig.base.json` in the workspace `tsconfig.json` and link sibling packages via `"workspace:*"`.

## Telemetry suppression

When adding or upgrading any CLI, tool, or dependency:

1. Check whether the tool collects telemetry, crash reports, or analytics.
2. Disable telemetry in native config files where supported (such as `core.disableTelemetry` in Storybook).
3. Add package kill-switch environment variables to `.env.example` and `.github/workflows/*.yml`, alongside `DO_NOT_TRACK=1`.
