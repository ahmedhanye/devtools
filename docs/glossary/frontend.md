# Frontend & UI Context

Domain terms for the DevTools web dashboard and presentation boundaries.

## Language

**Pages-First Extraction Rule**:
The invariant requiring page-specific UI, hooks, and fetching logic to begin inside page slices and extract to lower layers only when actively reused across distinct pages.
_Avoid_: Premature extraction, common components, shared-first

**App Router Boundary Adapter**:
Thin framework entrypoint files that declare route metadata and parameter parsing before delegating immediately to page slices.
_Avoid_: Next route page, controller page, root route

**Tear-Free Client Hydration**:
The client-safe mounting boundary that prevents server/client hydration layout shifts and cascading re-renders.
_Avoid_: Is-client check, mounted flag, render delay

**Semantic Theme Tokens**:
Design system styling tokens mapping semantic visual intent rather than arbitrary literal color values.
_Avoid_: Utility colors, arbitrary tailwind values, raw hex colors

**Portable Story**:
A co-located component story composed with routing and provider contexts so the same specification serves as both interactive catalog documentation and an executable runtime test.
_Avoid_: Component unit test, RTL test file, visual-only story
