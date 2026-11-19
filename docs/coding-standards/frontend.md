# Frontend application standards and FSD v2.1

Authoring rules for Feature-Sliced Design (FSD) v2.1 slices, Storybook Portable Stories, React 19 patterns, and browser boundaries in `apps/frontend`. For layer topology and static export delivery, see [Frontend application architecture](../architecture/frontend.md).

## FSD v2.1 layer and slice rules

- **Unidirectional imports.** Modules import strictly downward (`app` -> `pages` -> `features` -> `entities` -> `shared`), enforced by `bun run lint:fsd`. Avoid the `widgets` layer.
- **Pages-First Extraction Rule.** Start all page UI, hooks, and fetching inside `apps/frontend/src/pages/<page>/`. Extract to `features/` or `entities/` only when reused across multiple distinct pages with a single focused responsibility.
- **Public slice API.** Every slice exports exclusively through its root `index.ts`. Deep imports into slice internals (such as `@/features/browser-install/ui/button`) are prohibited.
- **Thin App Router Boundary Adapters.** Keep `apps/frontend/src/app/` files (`page.next.tsx`, `layout.next.tsx`) limited to route metadata, global providers, and parameter parsing, delegating immediately to FSD page components in `src/pages/<page>/ui/page.tsx`.
- **Naming and segments.** Name all files and directories in lowercase `kebab-case` using domain nouns (`service-status-card.tsx`, `use-service-health.ts`), never generic role names (`component.tsx`, `types.ts`, `utils.ts`). Group slice internals into `ui/`, `model/`, and `api/`.

## Storybook presentation and CSF v3

Every presentational component colocates `component.tsx`, `component.stories.tsx`, and `index.ts`. Author stories in CSF v3 with a named `const meta` default export (`import type { Meta, StoryObj } from "@storybook/react"`). See `apps/frontend/src/shared/ui/shadcn/button/button.stories.tsx` for a full reference story, and [Storybook component testing](../testing/stories.md) for Vitest runner and `play()` interaction rules.

Cover these visual states where applicable: **default**, **visual variants**, **size variants**, **loading skeletons** (`data-slot="skeleton"`), **disabled**, and **text overflow**. Wrap layout-sensitive stories in a decorator when needed:

```tsx
export const InNarrowContainer: Story = {
  decorators: [
    (Story) => (
      <div className="max-w-xs border border-border p-4">
        <Story />
      </div>
    ),
  ],
};
```

Keep presentational components props-driven and deterministic (no network calls, random IDs, or unsynced timers inside stories).

## React 19 and design system

- **Native `ref` props.** Pass `ref` directly in component props; do not use `React.forwardRef`.
- **Modern context API.** Render `<Context value={val}>` without `.Provider` and read contexts with `use(Context)` instead of `useContext`.
- **Semantic Theme Tokens.** Use design tokens (`bg-primary`, `text-muted-foreground`, `border-border`) rather than raw Tailwind palette classes (`bg-blue-500`) or arbitrary values. Design-system lint rules are enforced via `@shadcn/lint` in [`apps/frontend/.oxlintrc.json`](../../apps/frontend/.oxlintrc.json).
- **Layout-only `className`.** Consumers pass `className` only for layout and spacing; internal colors and borders belong inside the component.
- **Explicit variants.** Prefer CVA variants or dedicated variant components over conflicting boolean flags (`isSuccess`, `isPending`, `isWarning`).
- **Headless primitives.** Use `@base-ui/react` with the `render` prop pattern rather than Radix `asChild`.

## Browser boundaries and async lifecycles

- **Tear-Free Client Hydration.** Guard client-only UI with `useIsMounted()` and read URL query parameters with `useNativeSearchParams()` from `@/shared/lib` (both backed by `useSyncExternalStore` to avoid hydration mismatches and top-level Suspense requirements).
- **Browser global guards.** Guard `window`, `document`, `localStorage`, and `sessionStorage` with `typeof window !== "undefined"` and server-safe fallbacks.
- **Scoped abort controllers.** In polling or fetch hooks, create an `AbortController` per request and abort in-flight work on unmount or dependency changes. Wrap DOM event handlers (`() => handleClick()`) so DOM events never leak into `AbortSignal` or parameter slots.
