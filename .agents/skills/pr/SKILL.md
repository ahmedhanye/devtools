---
name: pr
description: Create, update, or stack pull requests following repository conventions. Use when opening a PR, updating a PR title or body, or splitting large multi-layer changes into stacked PRs.
---

# Pull requests

Create, update, or stack pull requests following repository rules without editing source code.

## 1. Inspect repository rules and branch state

Read `CONTRIBUTING.md` (and its linked pull request, push, and stacked PR guides), `.github/PULL_REQUEST_TEMPLATE.md`, and `REVIEW.md` in full. In parallel, inspect working tree status, commits and diff stats against `origin/main`, any open PR for the branch, and the linked tracking issue and parent Spec if present. Verify affected canonical terms in `GLOSSARY.md` and architectural constraints in `ARCHITECTURE.md` (and linked ADRs, especially for `Door: one-way` changes).

Completion criterion: All applicable PR rules, branch diffs, existing PR state, and linked issue criteria are loaded.

## 2. Write the PR plan artifact and pause for approval

Pick the single matching strategy, either a single PR or a stacked PR chain. Write or update a single Markdown PR plan artifact using the platform's native session artifact or plan file with:

- The chosen strategy, branch or layer order, and commit mapping.
- For each planned PR: `base` and `head` branches, validated title, labels, assignee, issue link, and the complete draft PR description matching the repository template and visual guidelines.

In chat, share only a concise summary table and a link to the PR plan artifact, then ask for confirmation before creating, stacking, or updating any PR. If the user requests changes, update the same artifact in place before executing.

Completion criterion: The PR plan artifact contains every planned PR title and full description, and the user explicitly confirms execution.

## 3. Execute the approved plan and stop

Run only the narrowest unverified local checks required by `REVIEW.md` for each planned PR, running fast static and cross-layer checks before heavy build or coverage suites and skipping checks already green on the same commit. Update completed tracking issue checklists and project status, then create, stack, or update the PRs using the exact approved titles and bodies from the plan artifact.

- **Plan lock.** Never silently reorder approved stack layers or edit source files during PR execution. If a local check failure or layer dependency invalidates the plan, stop immediately, update the PR plan artifact with the blocker and proposed options, and wait for user approval.
- **Stop after creation.** End the workflow as soon as the PRs are created or updated and their URLs are returned.

Completion criterion: All approved PRs are created or updated with synced metadata and issue links, and their URLs are returned to the user.
