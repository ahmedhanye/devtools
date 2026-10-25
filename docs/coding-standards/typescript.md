# TypeScript Coding Standards

Repository-wide TypeScript engineering standards and language baselines across all monorepo packages and applications.

## Compiler baselines

All workspaces inherit compiler settings from [tsconfig.base.json](../../tsconfig.base.json):

1. **Strict type checking**: `strict: true` and `noUncheckedIndexedAccess: true` are enabled everywhere. Accessing indexable collections (`arr[i]`, `record[key]`) produces `T | undefined`, requiring explicit guard checks before access.
2. **Modern target and bundling**: `target: "ES2022"` and `moduleResolution: "bundler"` enable native modern JavaScript constructs, top-level `await`, and direct TypeScript source resolution.
3. **Isolated modules**: `isolatedModules: true` guarantees that every file can be transpiled independently without whole-program type analysis.

## Type hygiene and imports

1. **Type-only imports**: Enforce `import type { ... }` when importing types, interfaces, or type aliases. This preserves runtime bundle isolation and prevents circular runtime dependencies:
   ```ts
   // Good
   import type { ServerConfig } from "./types";
   import { createServer } from "./server";

   // Bad: imports type with runtime import syntax
   import { ServerConfig, createServer } from "./server";
   ```
2. **No arbitrary `any`**: Never use `any`. Use `unknown` when incoming data types are unverified at compile time, and narrow types using type guards, discriminating unions, or Zod schemas before operating on them.
3. **Inference vs. explicit annotations**:
   - Infer local variables and simple internal return values to minimize visual noise.
   - Explicitly annotate exported public APIs, functions, class methods, and library entrypoints to maintain clear public contracts and catch unintended signature drift:
   ```ts
   // Public package export: explicit parameter and return types
   export function parsePort(input: string | undefined): number {
     const resolved = Number(input);
     return Number.isInteger(resolved) && resolved > 0 ? resolved : 4318;
   }
   ```

## Schema-first domain contracts (Zod)

1. **Single source of truth**: All data crossing system boundaries (HTTP request/response bodies, CLI arguments, environment configuration, database query results, IPC messages) must be validated through Zod schemas.
2. **Inferred types**: Derive TypeScript types directly from schemas using `z.infer<typeof Schema>` instead of duplicating type definitions manually:
   ```ts
   import { z } from "zod";

   export const DaemonConfigSchema = z.object({
     port: z.number().int().min(0).max(65535).default(4318),
     host: z.string().default("127.0.0.1"),
     staticDir: z.string().optional(),
   });

   export type DaemonConfig = z.infer<typeof DaemonConfigSchema>;
   ```
3. **Strict schema parsing**: Use `.strict()` or `.parse()` on boundary payloads to reject unexpected fields when security or contract integrity requires exact input shapes.

## Error handling and causes

1. **Native Error instances with causes**: Always throw instances of `Error` or custom subclasses. When wrapping lower-level exceptions, attach the original error using the native `cause` option to preserve stack traces:
   ```ts
   try {
     await initializeDatabase();
   } catch (error) {
     throw new Error("Failed to initialize persistence engine", {
       cause: error,
     });
   }
   ```
2. **No primitive throws**: Never throw string literals, numbers, or anonymous objects (`throw "error"` or `throw { msg: "fail" }`).
3. **Distinct domain errors**: For domain-specific failure modes, define specialized error classes extending `Error` (e.g. `BrowserNotFoundError`, `InvalidPortError`) to allow programmatic handling via `instanceof`.
