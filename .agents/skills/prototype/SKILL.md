---
name: prototype
description: Build throwaway HTML prototypes in .scratch/prototypes/ paired with grilling rounds to settle UI layouts or state models. Use when exploring visual variants, layout trade-offs, or interactive state flows before editing application code.
---

# Prototype

Build throwaway, self-contained HTML prototypes under `.scratch/prototypes/<topic>/round-<N>.html` to answer visual or state-model questions without modifying tracked application or source files.

## Choose a branch

Identify which question is being answered from the prompt or surrounding code:

- **"What should this look like?"** -> [UI.md](UI.md). Build structurally distinct visual and layout options styled with the project's copied CSS theme tokens.
- **"Does this logic or state model feel right?"** -> [LOGIC.md](LOGIC.md). Build an interactive state-machine or flow demo with free-play actions and guided scenario tabs.

## Round workflow

1. **Create one multi-variant file per round.** Save all options for the round in a single self-contained HTML file at `.scratch/prototypes/<topic>/round-<N>.html` with zero external build steps. Include a built-in switcher keyed by URL variant hashes (`#q1-a`, `#q1-b`, `#q2-a`) so every option opens directly in the browser.
2. **Pair with a grilling round.** Follow [the grilling skill](../grilling/SKILL.md) to present the round's questions and options. Link every option directly to its local preview URL (`http://localhost:4173/<topic>/round-<N>.html#q<N>-<opt>`).
3. **Share the preview server command on Round 1.** Print this reusable command in chat on Round 1 without starting a background server (omit it on Round 2+ unless asked):

```bash
python3 -m http.server 4173 --directory .scratch/prototypes
```

4. **Iterate until settled.** Update `.scratch/prototypes/<topic>/round-<N>.html` across rounds as decisions evolve, then fold the winning design into the real codebase once approved.

Completion criterion: `.scratch/prototypes/<topic>/round-<N>.html` renders all round options under `#q<N>-<opt>` hashes, the paired grilling round links every option to its preview URL, and tracked source files remain untouched.
