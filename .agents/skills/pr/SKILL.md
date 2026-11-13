---
name: pr
description: Create, update, or stack pull requests following repository conventions. Use when opening a PR, updating a PR title or body, or splitting large multi-layer changes into stacked PRs.
---

Read any repository PR rules (such as `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, or linked guides) in full if present. In parallel, inspect working tree status, commits and diff stats against `origin/main`, any open PR for the branch, and the linked tracking issue and parent Spec if any. Pick the single matching strategy, either a single PR or a stacked PR chain, present the plan, and ask for confirmation before creating, stacking, or updating any PR; once approved, run the required checks, update completed issue checklists, and execute according to those rules.
