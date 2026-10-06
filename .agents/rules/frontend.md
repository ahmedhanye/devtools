---
trigger: apps/frontend/**
description: Frontend invariants for Next.js App Router, Base UI, design tokens, hydration safety, and quality gates.
---

# Frontend invariants and standards

Architectural rules and development standards for `apps/frontend`.

## Architecture

1. Route entrypoints in `src/app/` act as thin routing adapters containing layout metadata and providers. Delegate feature presentation and orchestration to Feature-Sliced Design pages in `src/pages/<page>/`.
2. Expose shared segment public APIs through the segment index file (`src/shared/ui/index.ts`, `src/shared/lib/index.ts`, `src/shared/api/index.ts`).
3. Segment files use domain nouns (`service-status-card.tsx`, `use-service-health.ts`), not technical role labels (`component.tsx`, `types.ts`, `utils.ts`).
4. File and directory names use lowercase `kebab-case`. `PascalCase` is reserved for exported React components and TypeScript type symbols.

## Design system and components

1. Compose interactive components with Base UI `render={<Component />}` props and React 19 `ref` forwarding.
2. Follow `@shadcn/lint` design system contracts:
   - Use semantic theme tokens (`bg-primary`, `text-muted-foreground`, `bg-background`, `border-border`).
   - Control component appearance with component variants (`variant="outline"`, `size="sm"`). Use `className` on components strictly for layout, alignment, and positioning (`flex`, `grid`, `gap-*`, `m-*`).
   - Declare static class names with theme utilities instead of dynamic string interpolation or arbitrary bracket values.
3. Express distinct component states through specialized variant components instead of multi-state boolean flags.
4. Pass layout content through `children` and compound components. Use render callback props for dynamic list iteration.
5. React 19 patterns:
   - Pass `ref` as a standard prop in the component interface.
   - Render `<Context value={val}>` directly without the `.Provider` suffix.
   - Consume contexts with `use(Context)`.

## Browser boundaries and hydration

1. Guard client-only subtrees with `useIsMounted()` from `@/shared/lib`, using `useSyncExternalStore` for tear-free hydration.
2. Read client search parameters through `useNativeSearchParams()` from `@/shared/lib` to preserve static prerendering without top-level Suspense boundaries.
3. Guard browser globals (`window`, `document`, `localStorage`, `sessionStorage`) with `typeof window !== "undefined"`. Wrap storage access with in-memory fallbacks for server-side evaluation.
4. Model initial cold loads with explicit loading skeletons; defer live telemetry rendering to verified async fetch results.

## State and asynchronous boundaries

1. Represent multi-stage asynchronous lifecycles using discriminated unions (`status: "idle" | "loading" | "success" | "error"`).
2. Derive calculated state synchronously during rendering. Synchronize with effects strictly for external imperative subscriptions and browser APIs.
3. Declare Zod schemas statically at module scope for schema caching and type inference.
4. In hooks managing polling lifecycles, scope an `AbortController` per tick and abort in-flight requests on unmount.
5. Wrap event callbacks passed to fetch handlers to ensure DOM event arguments are discarded before reaching `AbortSignal` parameters.
6. Declare pure helper functions and formatters that do not close over component state at module scope.

## Verification pipeline

Run the complete verification pipeline before presenting code for review:

```bash
bun run verify
```

The command must exit with code 0.
