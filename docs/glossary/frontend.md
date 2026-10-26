# Frontend & UI Context

Domain terms for the DevTools web dashboard, Feature-Sliced Design architecture, and React 19 presentation boundaries.

## Language

**Feature-Sliced Design (FSD) v2.1**:
The frontend architectural methodology organizing `apps/frontend` strictly by ordered layers (`app` -> `pages` -> `features` -> `entities` -> `shared`).
_Avoid_: Layered architecture, component hierarchy, MVC frontend

**Pages-First Extraction Rule**:
The architectural invariant mandating that UI components, hooks, and fetching logic begin inside `pages/` and extract to lower layers only when actively reused across distinct pages.
_Avoid_: Premature extraction, common components, shared-first

**App Router Boundary Adapter**:
Thin Next.js App Router entrypoint files (`page.next.tsx`, `layout.next.tsx`) providing route metadata and parameter parsing before delegating immediately to FSD page slices.
_Avoid_: Next route page, controller page, root route

**Tear-Free Client Hydration**:
The client-safe mounting pattern implemented via `useIsMounted` and `useSyncExternalStore` preventing server/client hydration layout shifts and re-render waterfalls.
_Avoid_: Is-client check, mounted flag, render delay

**Semantic Theme Tokens**:
Design system styling tokens (`bg-primary`, `text-muted-foreground`, `border-border`) mapping semantic intent rather than arbitrary literal Tailwind classes.
_Avoid_: Utility colors, arbitrary tailwind values, raw hex colors

**Portable Story**:
A co-located Component Story Format module (`*.stories.tsx`) composed with framework routing and provider contexts so the same component specification renders identically as interactive catalog documentation and as an executable runtime test.
_Avoid_: Component unit test, RTL test file, visual-only story
