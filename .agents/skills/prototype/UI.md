# UI Prototype

Build **structurally distinct visual variations** inside a single self-contained HTML file at `.scratch/prototypes/<topic>/round-<N>.html`. The user flips between options in the browser, compares them alongside the grilling round, and picks a winner (or combines elements across options) before any application code changes.

If the question is about state transitions or business logic rather than layout or visuals, use [LOGIC.md](LOGIC.md).

## Rules

1. **Stay in `.scratch/prototypes/`.** Save all UI prototypes as self-contained HTML/CSS/JS files under `.scratch/prototypes/<topic>/round-<N>.html`. Never edit tracked application routes, components, or stylesheets for a prototype.
2. **Copy project theme tokens.** Extract the project's CSS custom properties (colors, radii, borders, typography) into the prototype's `<style>` block so every variant matches the application's real visual identity without importing frameworks or bundlers.
3. **Make variants structurally distinct.** Vary layout, information hierarchy, and primary affordances across options, rather than only colors or spacing.

## Round HTML structure

1. **Variant hash routing (`#q<N>-<opt>`).** Key every option by its grilling question and option letter (`#q1-a`, `#q1-b`, `#q2-a`). Reading `window.location.hash` on load and on `hashchange` activates that exact variant immediately so links from the grilling round open straight to the right view.
2. **Floating switcher bar.** Render a compact, high-contrast fixed bar at the bottom center showing:
   - Previous / Next arrows (wrapping across all variants in the round, updating `window.location.hash`).
   - Current variant label (for example, `Q1-A · Split Drawer`).
   - Left (`←`) and right (`→`) keyboard shortcuts (ignoring key presses inside `<input>`, `<textarea>`, or `[contenteditable]`).
3. **Realistic sample data.** Populate variants with realistic domain data so density, truncation, and empty/error states are visible.
