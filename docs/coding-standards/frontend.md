# Frontend Application Standards and FSD v2.1

Architectural invariants, Feature-Sliced Design (FSD) v2.1 patterns, React 19 rules, and browser lifecycle boundaries for `apps/frontend`.

## Architecture and layer hierarchy

`apps/frontend` follows the **Feature-Sliced Design (FSD) v2.1** architectural specification:

```text
apps/frontend/src/
├── app/                  # Next.js App Router adapters, providers, route entrypoints
├── pages/                # Full-page compositions and page-scoped state (e.g. dashboard/ui/page.tsx)
├── features/             # User interactions carrying business value (created on demand via Pages First rule)
├── entities/             # Business domain entities (created on demand via Pages First rule)
└── shared/               # Reusable UI primitives, utility libraries, design system tokens
```

1. **Unidirectional layer imports**: Modules may import only from layers strictly below them in the hierarchy:
   `app` -> `pages` -> `features` -> `entities` -> `shared`. (The `widgets` layer is discouraged).
2. **The "Pages First" extraction rule**:
   - Begin all page-specific UI, data fetching, and state management inside `src/pages/<page>/`.
   - Do **not** extract components, hooks, or queries to `features` or `entities` prematurely.
   - Extract code only when it is actively reused across multiple distinct pages, has an independent reason to change, and serves a focused responsibility.
3. **Public API boundary**: Every slice must export its public interface exclusively through its root `index.ts` file. Deep imports into slice internals (e.g. `import ... from "@/features/browser-install/ui/button"`) are prohibited.
4. **App Router boundary adapters**: Route entrypoint files in `src/app/` (`page.next.tsx`, `layout.next.tsx`) are thin routing adapters configured via `pageExtensions: ["next.tsx", "next.ts"]`. They declare layout metadata, global providers, and parameter parsing, delegating feature orchestration immediately to FSD page components in `src/pages/<page>/ui/page.tsx`.

## UI testing and Storybook-first presentation

1. **No `*.test.tsx` files or `tests/` directories for UI components**: Authoring unit test files (`*.test.tsx`) with `@testing-library/react` assertions for presentational components is prohibited in `apps/frontend`. Unit tests (`*.test.ts`) are strictly reserved for pure utility functions, custom state hooks, and API schemas across `src/shared/lib/` as well as slice `model/` and `api/` segments (with zero JSX).
2. **Storybook (`*.stories.tsx`) as the single source of truth**: All UI presentation, states, variants, and interactive behaviors are declared exclusively in co-located Storybook stories (`component.stories.tsx`).
3. **Automated Storybook test execution & diff coverage**: Vitest is configured in `apps/frontend/vitest.config.ts` to automatically execute `src/**/*.stories.{ts,tsx}` in `happy-dom` via Storybook Portable Stories (`composeStories` from `@storybook/nextjs-vite`), executing story mounts, decorators, and `play()` functions directly under `@vitest/coverage-v8`.
4. **App Router boundary adapters exempted**: Thin framework routing entrypoints (`src/app/**/*.next.{ts,tsx}`) contain no UI logic and are exempted from unit diff coverage gating.
5. **Co-location structure**: Every presentational component must co-locate its story file and barrel exports:
   - `component.tsx` (component implementation)
   - `component.stories.tsx` (states, variants, and interaction tests)
   - `index.ts` (public segment export)

## Naming conventions and file structure

1. **Domain nouns over technical roles**: Segment files must be named using domain nouns (`service-status-card.tsx`, `use-service-health.ts`), never technical role labels (`component.tsx`, `types.ts`, `utils.ts`, `helpers.ts`).
2. **Kebab-case file naming**: Name all files and directories in `apps/frontend` using lowercase `kebab-case` (`service-card.tsx`, `use-is-mounted.ts`). `PascalCase` is strictly reserved for exported React components and TypeScript type symbols in code.
3. **Colocation of slice segments**: Within a slice, group code by domain segment:
   - `ui/`: Presentational components.
   - `model/`: Hooks, state management, stores, and types.
   - `api/`: Endpoint fetching functions and Zod response schemas.

## React 19 standards and design system

1. **Native ref props**: Pass `ref` as a standard prop in component interfaces. Do not use `React.forwardRef`.
2. **Modern context consumption**: Render `<Context value={val}>` directly without `.Provider`. Consume React contexts with `use(Context)` instead of `useContext(Context)`.
3. **Semantic theme tokens**: Enforce design system tokens (`bg-primary`, `text-muted-foreground`, `bg-background`, `border-border`) rather than arbitrary Tailwind color classes (`bg-blue-500`, `text-gray-700`).
4. **Layout-only `className` props**: Component consumers may use the `className` prop strictly for layout, alignment, and positioning (margins, flex/grid placement). Internal styling, colors, and borders belong inside the component definition.
5. **Variant components over boolean flags**: Express distinct component visual states through explicit variant components or CVA variants rather than multiple conflicting boolean flags (`isSuccess`, `isPending`, `isWarning`).

## Browser boundaries and hydration safety

1. **Tear-free client hydration**: Guard client-only subtrees with `useIsMounted()` from `@/shared/lib`, utilizing `useSyncExternalStore` to prevent hydration mismatches without cascading re-renders.
2. **Static search parameter access**: Read client search parameters through `useNativeSearchParams()` from `@/shared/lib` utilizing `useSyncExternalStore` (subscribing to `popstate` events) to preserve static prerendering without wrapping pages in top-level Suspense boundaries or triggering unneeded state cascades.
3. **Browser global guards**: Guard all access to browser globals (`window`, `document`, `localStorage`, `sessionStorage`) with `typeof window !== "undefined"`. Provide in-memory fallbacks when evaluating on the server.
4. **Loading skeletons and slots**: Render explicit loading skeletons on initial load using `data-slot="skeleton"`. Defer telemetry and live data rendering to verified async fetch results.
5. **Headless UI and design system linting**: Use `@base-ui/react` headless primitives with the `render` prop pattern (avoiding Radix-specific `asChild` assumptions). Enforce design system rules via `@shadcn/lint` in `apps/frontend/.oxlintrc.json` (`shadcn/no-raw-colors`, `shadcn/no-restyle`, `shadcn/no-arbitrary-values`, `shadcn/no-inline-styles`).

## Asynchronous lifecycles

1. **Scoped abort controllers**: In hooks managing polling or interval lifecycles, instantiate an `AbortController` per tick and abort in-flight requests when the component unmounts or dependencies change.
2. **Clean event callback signatures**: Wrap event handlers passed to fetch or mutation functions to discard DOM event arguments (e.g. `(e) => handleClick()`) before reaching `AbortSignal` or parameter slots.
