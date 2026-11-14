---
name: pr
description: Create, update, or stack pull requests following repository conventions. Use when opening a PR, updating a PR title or body, or splitting large multi-layer changes into stacked PRs.
---

Read `CONTRIBUTING.md` (and its linked pull request, push, and stacked PR guides), `.github/PULL_REQUEST_TEMPLATE.md`, and `REVIEW.md` in full. In parallel, inspect working tree status, commits and diff stats against `origin/main`, any open PR for the branch, and the linked tracking issue and parent Spec if any. Verify affected canonical terms in `GLOSSARY.md` (and linked context glossaries) and architectural constraints in `ARCHITECTURE.md` (and linked ADRs, especially when marking `Door: one-way`). Pick the single matching strategy, either a single PR or a stacked PR chain, present the plan, and ask for confirmation before creating, stacking, or updating any PR; once approved, run the required checks, update completed issue checklists, and execute according to those rules.
