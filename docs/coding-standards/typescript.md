# TypeScript coding standards

Repository-wide TypeScript compiler baselines, type hygiene, Zod boundary validation, and error conventions across all workspaces.

## Compiler baselines

All workspaces inherit compiler settings from [`tsconfig.base.json`](../../tsconfig.base.json):

- **Strict checks.** `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, and `verbatimModuleSyntax` are enabled everywhere (`erasableSyntaxOnly` is enabled across non-CSP-evaluator workspaces). Indexed accesses (`arr[i]`, `record[key]`) evaluate to `T | undefined` and require explicit guards.
- **Target and bundling.** `target: "ES2024"`, `moduleResolution: "bundler"`, and `isolatedModules: true` enable modern syntax, direct TypeScript source imports, and independent per-file transpilation.

## Type hygiene and imports

- **Type-only imports.** Always write `import type { ... }` for types, interfaces, and type aliases (`verbatimModuleSyntax` enforces this).
- **Ban `any` and unsafe assertions.** Never use `any`, and avoid unsafe narrowing `as` assertions in production source (`typescript/no-unsafe-type-assertion`). Narrow `unknown` inputs with type guards, discriminated unions, or Zod schemas.
- **Inference vs. explicit annotations.** Infer local variables and internal helpers; annotate exported functions, class methods, and public entrypoints explicitly to lock down public contracts.

## Schema-first domain contracts (Zod)

Validate all data crossing system boundaries (HTTP payloads, CLI flags, environment config, database rows, IPC messages) with Zod, and derive TypeScript types directly from schemas using `z.infer`:

```ts
export const ExampleConfigSchema = z
  .object({
    port: z.number().int().min(0).max(65535).default(4000),
    host: z.string().min(1).default("127.0.0.1"),
  })
  .strict();

export type ExampleConfig = z.infer<typeof ExampleConfigSchema>;
```

Use `.strict()` on boundary objects when unexpected keys must fail validation. See `packages/core/src/config.ts` and `packages/lighthouse/src/contracts/schemas.ts` for live schemas.

## Error handling and causes

- **Native `Error` subclasses with `cause`.** Always throw `Error` or domain subclasses (`BrowserNotFoundError`, `InvalidPortError`, `WorkerExecutionError`), attaching lower-level exceptions via `{ cause: error }`:
  ```ts
  try {
    await initializeDatabase();
  } catch (error) {
    throw new Error("Failed to initialize persistence engine", {
      cause: error,
    });
  }
  ```
- **No primitive throws.** Never throw strings, numbers, or plain objects.
