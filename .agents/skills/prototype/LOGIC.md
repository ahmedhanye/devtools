# Logic Prototype

Build a self-contained HTML file at `.scratch/prototypes/<topic>/round-<N>.html` that lets anyone drive a state model or workflow by clicking buttons and inspecting live state transitions. Use this when the question is about **business logic, state transitions, or data shape** rather than visual layout.

If the question is "what should this look like?", use [UI.md](UI.md).

## Structure

1. **State the question at the top.** Include a short plain-language summary of the state model and the open question being tested.
2. **Isolate the logic in a pure `<script>` module.** Write the reducer, state machine, or pure transformation functions without touching the DOM directly so the validated logic can lift cleanly into production code later.
3. **Use domain language.** Label buttons, states, and transitions in plain user/domain terms rather than internal variable names.
4. **Provide free-play actions and guided walkthroughs.**
   - **Current state panel:** Render the full relevant state as readable labeled fields after every action, highlighting what just changed.
   - **Free-play buttons:** One button per action so the user can test any sequence.
   - **Guided scenario tabs:** Ordered step buttons for key flows (happy path, tricky edge cases, and illegal transitions) that reset to a known initial state when selected.
5. **Support `#q<N>-<opt>` variant hashes.** When a grilling round compares multiple state-model or workflow options, include a `#q<N>-<opt>` switcher bar matching [UI.md](UI.md) so each grilling option links directly to its corresponding interactive behavior.

## Anti-patterns

- **No test suites or build tools.** Plain HTML, CSS, and JS only; zero external dependencies or framework dev servers.
- **No real database wiring.** Use in-memory state by default.
- **No tracked source edits.** Keep the prototype strictly under `.scratch/prototypes/` until a decision is approved.
