# Monorepo Package Standards

Architectural guidelines, boundary rules, and development practices for shared domain packages under `packages/*`.

## Headless domain isolation

1. **Unidirectional dependency ordering**: Packages under `packages/*` are headless domain libraries (`@devtools/core`, `@devtools/db`, `@devtools/browser`). They supply shared business logic, schemas, and persistence primitives:
   - Packages must **never** import from applications (`apps/*`) or documentation (`site/`).
   - Packages follow a strict hierarchy: `@devtools/core` is a zero-dependency foundation; `@devtools/db` and `@devtools/browser` depend on `@devtools/core`. Sibling packages must not form circular references.
2. **Framework independence**: Headless packages must remain independent of frontend UI frameworks (React, Next.js) and HTTP routing engines (Hono). Keep domain models and business rules pure and decoupled from delivery mechanisms.

## Direct source exports

1. **Subpath exports mapping to TypeScript source**: Internal monorepo packages declare direct source exports in their `package.json` instead of requiring build artifacts (`dist/`):
   ```json
   {
     "name": "@devtools/db",
     "main": "./src/index.ts",
     "exports": {
       ".": "./src/index.ts",
       "./schema": "./src/schema/index.ts",
       "./migrator": "./src/migrator.ts"
     }
   }
   ```
2. **Bundler resolution**: Consuming workspaces resolve TypeScript files on the fly via `moduleResolution: "bundler"`, eliminating build delays and ensuring immediate feedback during development.
3. **Explicit public seams**: Only symbols exported from designated subpath entrypoints (`src/index.ts`, `src/schema/index.ts`) constitute the public API. Consuming applications must never import internal paths directly (e.g. `@devtools/db/src/internal/connection`).

## Configuration seams and ADR 0002

1. **No ambient `process.env` reads**: Never access `process.env` inside domain functions, models, or service classes. Ambient environment reads create race conditions in concurrent test suites and couple libraries to Node/Bun host environments.
2. **Centralized configuration modules**: Isolate all environment variable resolution into a single `config.ts` file per package.
3. **Injectable environment seams**: Every configuration resolver must accept an optional `options.env` parameter:
   ```ts
   export interface ResolveDatabaseOptions {
     env?: Record<string, string | undefined>;
     customPath?: string;
   }

   export function resolveDatabasePath(
     options: ResolveDatabaseOptions = {},
   ): string {
     const env = options.env ?? process.env;
     const envPath =
       options.customPath ?? env.DEVTOOLS_DB_PATH ?? env.DATABASE_URL;
     if (envPath) {
       return envPath === ":memory:"
         ? ":memory:"
         : resolve(process.cwd(), envPath);
     }
     if (env.NODE_ENV === "test" || env.BUN_ENV === "test") {
       return ":memory:";
     }
     if (env.NODE_ENV !== "production") {
       const root = findWorkspaceRoot() ?? process.cwd();
       return resolve(root, ".devtools", "devtools.db");
     }
     return join(homedir(), ".devtools", "devtools.db");
   }
   ```
4. **Static verification**: Oxlint enforces this boundary across `packages/**/src/**` by denying `node/no-process-env`, allowing exceptions exclusively in designated `config.ts` modules.

## Deep module design

1. **Depth as leverage**: Follow deep module principles: expose a minimal, stable public surface area that conceals substantial internal complexity (such as SQLite connection pooling, WAL mode initialization, or Chromium binary resolution).
2. **Seam discipline**: Introduce seams (e.g. dependency injection for file probes or network calls) only where testing or genuine variation requires it. Avoid speculative abstractions or single-use interfaces.
