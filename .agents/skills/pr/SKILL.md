---
name: pr
description: Create, update, or stack pull requests following repository conventions. Use when opening a PR, updating a PR title or body, or splitting large multi-layer changes into stacked PRs.
---

# Pull requests

Create, update, or stack pull requests following repository rules without silent source edits.

## 1. Inspect repository rules and branch state

Read `CONTRIBUTING.md` (and its linked pull request, push, and stacked PR guides), `.github/PULL_REQUEST_TEMPLATE.md`, and `REVIEW.md` in full. In parallel, inspect working tree status, commits and diff stats against `origin/main`, any open PR for the branch, and the linked tracking issue and parent Spec if present. Verify affected canonical terms in `GLOSSARY.md` and architectural constraints in `ARCHITECTURE.md` (and linked ADRs, especially for `Door: one-way` changes).

Completion criterion: All applicable PR rules, branch diffs, existing PR state, and linked issue criteria are loaded.

## 2. Dry-run stacked layers, write the PR plan, and pause for approval

Pick the single matching strategy, either a single PR or a stacked PR chain.

When proposing a stacked PR chain, validate the split locally before writing the plan. Require a clean working tree, build the candidate stack branches in the active workspace, and run the full `REVIEW.md` verification checklist (including matching conditional checks) on each layer against its parent base. Confirm the top layer has zero diff against the original branch. When a layer fails, merge coupled files into one clean layer first. If keeping a split requires a temporary intermediate edit that a higher layer restores, list every temporary edit explicitly in the plan. Restore the original branch before pausing for approval.

Write or update a single Markdown PR plan artifact using the platform's native session artifact or plan file with:

- The chosen strategy, branch or layer order, commit mapping, verification status, and any explicit temporary intermediate edits.
- For each planned PR: `base` and `head` branches, validated title, labels, assignee, issue link, and the complete draft PR description matching the repository template and visual guidelines.

In chat, share only a concise summary table and a link to the PR plan artifact, then ask for confirmation before creating, stacking, or updating any PR. If the user requests changes or cancels a stacked plan, delete unused local candidate branches and update the plan artifact before executing.

Completion criterion: Every planned stacked layer is locally verified with the original branch restored, the PR plan artifact contains every planned PR title and full description, and the user explicitly confirms execution.

## 3. Execute the approved plan and stop

Reuse already-verified dry-run branches directly. For any PR or commit not yet verified on its exact commit SHA, run the full verification checklist in `REVIEW.md` (including matching conditional checks). Update completed tracking issue checklists and project status, then create, stack, or update the PRs using the exact approved titles and bodies from the plan artifact.

- **Plan lock and delta recovery report.** Never silently reorder approved stack layers or edit source files during PR execution. If a check, dependency, push, or API failure invalidates the approved plan, stop immediately and leave the original PR plan artifact untouched. Write a new recovery report containing only what failed, one-line status for already-verified unchanged layers or PRs (omitting unchanged PR bodies), how to fix the blocker with the recommended change and alternatives, and the updated titles and descriptions for changed or combined PRs only. Share the summary and report link in chat, and wait for user approval.
- **Stop after creation.** End the workflow as soon as the PRs are created or updated and their URLs are returned.

Completion criterion: All approved PRs are created or updated with synced metadata and issue links, and their URLs are returned to the user.
