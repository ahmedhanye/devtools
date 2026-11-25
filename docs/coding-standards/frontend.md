# Frontend application standards and FSD v2.1

Authoring rules for Feature-Sliced Design (FSD) v2.1 slices, Storybook Portable Stories, React 19 patterns, and browser boundaries in `apps/frontend`. For layer topology and static export delivery, see [Frontend application architecture](../architecture/frontend.md).

## FSD v2.1 layer and slice rules

- **Unidirectional imports.** Cross-layer and cross-slice imports flow strictly downward (`app` -> `pages` -> `features` -> `entities` -> `shared`), while modules within a slice may import from sibling segments of that same slice (such as `ui/` importing hooks from `model/`). Cross-layer zones are enforced by `.fallowrc.json`, and FSD slice boundaries are enforced by `bun run lint:fsd`. Avoid the `widgets` layer.
- **Slice groups without barrels.** Domain-grouped folders such as `src/pages/lighthouse/{history,compare,run}/` or `src/features/lighthouse/{trigger-audit,inspect-run,active-audit-job}/` act strictly as namespaces: keep **no** group-level `index.ts`, **no** shared files directly in the group directory, and **no** imports between sibling slices.
- **Pages-First Extraction Rule.** Start all page UI, hooks, and fetching inside `apps/frontend/src/pages/<page>/`. Extract to `features/` or `entities/` only when reused across multiple distinct pages (or app shell) with a single focused responsibility.
- **TanStack Query placement.** Place shared `queryOptions` key factories and API clients inside `entities/<entity>/api/` (such as `lighthouseQueries`) so features and multiple pages share invalidation and cache seeding cleanly; keep page-exclusive queries inside `pages/<slice>/api/`.
- **Public slice API.** Every slice exports exclusively through its root `index.ts`. External consumers must import `shared/ui` primitives and domain blocks from `@/shared/ui` rather than deep paths inside `@/shared/ui/shadcn/*`.
- **Thin App Router adapters and `app/layouts/`.** Keep `apps/frontend/src/app/` route files (`page.next.tsx`, `layout.next.tsx`) thin: route files delegate immediately to FSD pages in `src/pages/`, `app/providers/` holds only runtime context providers (such as `QueryProvider`), and `app/layouts/` holds app-wide layout chrome (such as `AppShell` with sidebar navigation, URL-derived breadcrumbs, and header feature indicators). Never add dynamic `[id]` segments under static export ([ADR 0007](../adr/0007-static-export-query-param-routing.md)).
- **Strict `ui/` purity.** Keep `ui/*.tsx` files strictly presentational (JSX rendering and local visual interaction state). Never call TanStack Query hooks (`useQuery`, `useMutation`, `useQueryClient`), `fetch`, or business-controller logic directly inside `ui/`. Place custom hooks, schemas, and controller logic in `model/` (with `*.unit.test.ts`), and place transport functions and query factories in `api/`.
- **Two-file `ui/` segment and 1:1 Storybook colocation.** Every `pages/<slice>/ui/` directory contains strictly `page.tsx` (exporting only the page component) and `page.stories.tsx` (matching `pages/lighthouse/history/ui/`), with page-local sub-sections kept as unexported helper functions inside `page.tsx`. In `features/<slice>/ui/`, keep strictly `<feature>.tsx` and `<feature>.stories.tsx`. Inside `entities/<slice>/ui/`, keep only publicly exported `<component>.tsx` and `<component>.stories.tsx` pairs, keeping internal sub-sections unexported inside their owning exported component file. Slice `ui/` directories omit `ui/index.ts` because exports live in the slice root `index.ts`. Every UI `.tsx` file exports one React component and pairs 1:1 with a `*.stories.tsx` file covering default, empty, invalid/error, and loading variants.
- **Naming, segments, and `shared/ui/` purity.** Name all files and directories in lowercase `kebab-case` using domain nouns (`service-status-card.tsx`, `use-service-health.ts`), never generic role names (`component.tsx`, `types.ts`, `utils.ts`). Group slice internals into `ui/`, `model/`, and `api/`. Keep `shared/ui/` (`shadcn/` and `blocks/`) purely presentational: app-themed reusable UI is allowed, provided it contains zero business rules, zero data fetching, and zero imports from `entities/`, `features/`, or `pages/`.

## Storybook presentation and CSF v3

Standalone component folders (`shared/ui/shadcn/<component>/`, `shared/ui/blocks/<component>/`, and `app/layouts/<layout>/`) colocate `component.tsx`, `component.stories.tsx`, and `index.ts`, whereas slice `ui/` directories (`pages/`, `features/`, `entities/`) omit `ui/index.ts` and export through their slice root `index.ts`. Author stories in CSF v3 with a named `const meta` default export (`import type { Meta, StoryObj } from "@storybook/react"`). See `apps/frontend/src/shared/ui/shadcn/button/button.stories.tsx` for a full reference story, and [Storybook component testing](../testing/stories.md) for Vitest runner and `play()` interaction rules.

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
- **Semantic Theme Tokens.** Use design tokens (`bg-primary`, `bg-success-subtle`, `text-muted-foreground`, `border-border`) rather than raw Tailwind palette classes (`bg-blue-500`), inline `style` props, or arbitrary bracket values (`w-[360px]`). Prefer CVA variants or static lookup records over dynamic template-string classes. Design-system and React performance lint checks (and their overrides) are configured in [`apps/frontend/.oxlintrc.json`](../../apps/frontend/.oxlintrc.json) and root [`.oxlintrc.json`](../../.oxlintrc.json).
- **Layout-only `className`.** Consumers pass `className` only for layout and spacing; internal colors, typography, padding, and borders belong inside the component or wrapper elements. When a shadcn primitive needs a different surface, padding, or semantic variant (e.g., `PopoverContent` `padding="none"`, `CommandItem` `showCheck={false}`, `Badge` semantic tones), add an explicit prop or CVA variant inside `src/shared/ui/shadcn/` rather than working around `shadcn/no-restyle` or duplicating the primitive in `shared/ui/blocks/`.
- **Tailwind v4 data-attribute selectors.** `apps/frontend/src/app/globals.css` imports `shadcn/tailwind.css` for shadcn `@custom-variant` rules (`data-open`, `data-closed`, `data-selected`, `data-horizontal`, `data-vertical`). For `group-data-*` or custom value-bearing data attributes, prefer explicit value matchers (`data-[orientation=horizontal]:`, `data-[selected=true]:`) rather than bare presence matchers (`data-horizontal:`, `data-selected:`).
- **Explicit variants.** Prefer CVA variants or dedicated variant components over conflicting boolean flags (`isSuccess`, `isPending`, `isWarning`).
- **Headless primitives.** Use `@base-ui/react` with the `render` prop pattern rather than Radix `asChild`.

## Browser boundaries and async lifecycles

- **Tear-Free Client Hydration.** Guard client-only UI with `useIsMounted()`, read URL query parameters with `useNativeSearchParams()`, and mutate same-route query parameters with `updateNativeSearchParams()` from `@/shared/lib` (backed by `useSyncExternalStore` plus synthetic change events to avoid hydration mismatches, top-level Suspense requirements, and stale same-route state).
- **Relative API transport.** Issue all browser fetches, `EventSource` SSE streams, and report `<iframe>` URLs against relative `/api/*` paths so static exports work under any loopback Daemon port.
- **Browser global guards.** Guard `window`, `document`, `localStorage`, and `sessionStorage` with `typeof window !== "undefined"` and server-safe fallbacks.
- **Scoped abort controllers.** In polling or fetch hooks, create an `AbortController` per request and abort in-flight work on unmount or dependency changes. Wrap DOM event handlers (`() => handleClick()`) so DOM events never leak into `AbortSignal` or parameter slots.
