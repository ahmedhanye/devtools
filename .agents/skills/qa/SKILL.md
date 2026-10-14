---
name: qa
description: Generate a two-part verification artifact for code changes: an interactive manual verification checklist for testers, and an architecture and test coverage review guide for developers.
disable-model-invocation: true
---

# Quality assurance

Generate a verification artifact for a code change, branch, or pull request. The artifact separates manual human verification from developer code comprehension.

Do not run linters, test suites, or package verification commands. Automated tools and continuous integration pipelines enforce automated checks.

Run this skill when the developer invokes `/qa`.

## 1. Resolve target changes and intent

Determine the target and declared scope from the developer prompt:

1. **Pull request**: If the prompt names a PR number or URL, inspect the declared intent with `gh pr view <number>` and inspect the diff with `gh pr diff <number>`.
2. **Specific commits or files**: If the prompt names a commit, ref, or file path, inspect the commit messages with `git log -1 <ref>` and inspect the diff with `git diff <ref>`.
3. **Feature or concept**: If the prompt names a feature, locate relevant commits with `git log --grep="<term>"` and inspect the diff with `git diff`.
4. **Default**: If the prompt names no target, inspect `git diff main...HEAD`.

Capture changed file statistics:

```bash
git diff <target> --stat
```

Anchor verification to the author's declared scope in the pull request description or commit log. Never invent verification steps for features that the diff touches partially or that remain unbuilt.

## 2. Author the verification artifact

Create a session artifact named `qa_<target_slug>.md` using the artifact tool.

Do not write files to `.scratch/` or mutate codebase files.

Structure the artifact into these sections:

### Header and visual overview

Begin with metadata and a concise visual summary borrowing conventions from `show-me`:

- Target reference, branch, or pull request link.
- Diff statistics with changed files, additions, and deletions.
- Declared intent in one or two sentences.
- Visual change sketch: render a component tree diff, call tree, file layout diff, or state transition diagram showing the structure of what changed.

### Part 1: QA specialist manual checklist

Write this section for a human tester verifying the software interactively in a browser, mobile viewport, or terminal.

Omit code identifiers, file paths, CSS class names, and internal implementation details. Write purely from the user's perspective.

Include relevant items across these categories:

- **Initial presentation and empty states**: Visual layout, typography, alignment, and empty or default state appearance.
- **Responsive viewports**: Breakpoints, mobile drawers, desktop sidebars, and avoidance of accidental horizontal scrolling.
- **Interactive user flows**: Click, tap, toggle, hover tooltips, and state persistence across page reloads.
- **Keyboard flow and accessibility**: Tab order, focus rings, focus trapping inside dialogs, and dismissal with Escape.
- **Interactive terminal commands**: For non-UI changes, test terminal commands, prompt flows, flag behavior, and rendered console formatting.

If the change modifies only internal libraries (`packages/core`) with zero human-facing interactive surface, omit Part 1 and state that automated suites verify the change.

### Part 2: Developer review guide

Write this section for an experienced developer reviewing the changes. Provide technical synthesis and context rather than a verification checklist.

Do not write checklist items for code structure, file placement, or automated checks. Present informative technical facts across these categories:

- **Code and architecture decisions**: Feature-Sliced Design layer placement, headless component wrapping, library adoptions or replacements, and dead code pruned.
- **Code logic and state flow**: State machines, context providers, synchronization with local storage, viewport listeners, and lifecycle teardown.
- **Test scenarios added and coverage**: Summary of unit tests, Storybook stories, and end-to-end tests introduced by the change, explaining what behaviors and edge cases they guard.

### Execution boundaries

- Never tell the developer to run terminal verification scripts or automated commands (`bun run verify`).
- Never include bug diagnosis, root cause analysis, or remediation advice. If an anomaly is observed, document the expected behavior without troubleshooting it inside the artifact.
- Never generate blank notes tables, walkthrough log templates, or empty checklists.
- Never echo user chat complaints or prompt feedback into the artifact.

## 3. Deliver chat pointer

Keep the chat response strictly to a brief pointer to the session artifact. Direct the user to review the manual checklist and developer guide.
