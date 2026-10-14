---
trigger: apps/frontend/**
description: Frontend invariants for Next.js App Router, design tokens, hydration safety, and lifecycle boundaries.
---

# Frontend invariants and standards

Architectural rules and development standards for `apps/frontend`.

## Architecture and naming

1. Route entrypoints in `src/app/` are thin routing adapters containing layout metadata and providers. Delegate feature presentation and orchestration to Feature-Sliced Design pages in `src/pages/<page>/`.
2. Segment files use domain nouns (`service-status-card.tsx`, `use-service-health.ts`), not technical role labels (`component.tsx`, `types.ts`, `utils.ts`).
3. Name all files and directories in `apps/frontend` using lowercase `kebab-case`. `PascalCase` is reserved for exported React components and TypeScript type symbols in code. This supersedes illustrative `PascalCase` or `camelCase` paths in Feature-Sliced Design vendor documentation.

## Design system and React 19

1. Pass `ref` as a standard prop in component interfaces. Render `<Context value={val}>` directly without `.Provider`. Consume contexts with `use(Context)`.
2. Follow `@shadcn/lint` design system contracts: use semantic theme tokens (`bg-primary`, `text-muted-foreground`, `bg-background`, `border-border`) rather than arbitrary Tailwind colors. Use `className` on components strictly for layout, alignment, and positioning.
3. Express distinct component states through variant components rather than multi-state boolean flags.

## Browser boundaries and hydration

1. Guard client-only subtrees with `useIsMounted()` from `@/shared/lib`, using `useSyncExternalStore` for tear-free hydration.
2. Read client search parameters through `useNativeSearchParams()` from `@/shared/lib` to preserve static prerendering without top-level Suspense boundaries.
3. Guard browser globals (`window`, `document`, `localStorage`, `sessionStorage`) with `typeof window !== "undefined"`. Wrap storage access with in-memory fallbacks for server-side evaluation.
4. Render explicit loading skeletons on initial load. Defer live telemetry rendering to verified async fetch results.

## Asynchronous lifecycles

1. In hooks managing polling lifecycles, scope an `AbortController` per tick and abort in-flight requests on unmount.
2. Wrap event callbacks passed to fetch handlers to discard DOM event arguments before reaching `AbortSignal` parameters.
