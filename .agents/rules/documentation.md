---
trigger: "**"
description: Documentation governance, retrieval workflows, and synchronization rules for internal docs.
---

# Documentation rules

Rules to navigate, retrieve, follow, and update documentation across the repository.

## Information retrieval workflow

Follow these steps before writing code:

1. **Locate the domain root guide:**
   Identify the affected domain and open the corresponding root guide:
   - For system components, lifecycles, or runtime topology: read `ARCHITECTURE.md`.
   - For language rules, API patterns, CLI conventions, or testing: read `CODING_STANDARDS.md`.
   - For git, branch, commit, PR, or issue workflows: read `CONTRIBUTING.md`.
   - For domain vocabulary and ADRs: read `GLOSSARY-MAP.md` and `docs/adr/`.

2. **Drill down to leaf standards:**
   Navigate from the root guide to the specific leaf document under `docs/<category>/<topic>.md` to extract concrete interface contracts, behavioral invariants, and configuration requirements.

3. **Apply domain checklists:**
   Evaluate the work against the authoring checklist in `CODING_STANDARDS.md`.

## When to update documentation

Update documentation when changes affect established architecture, coding standards, or contributor workflows (for example, adding or removing workspaces, altering API or CLI conventions, or updating PR requirements).

## How to update documentation

Apply these standards when editing documentation:

1. **Atomic co-location:**
   Commit documentation updates in the same commit and pull request as the code changes that triggered them. Do not postpone documentation updates to separate follow-up tickets.

2. **Maintain root-and-leaf parity:**
   When adding, moving, or removing a leaf document under `docs/`, update the table of contents and summary references in the corresponding root document (`ARCHITECTURE.md`, `CODING_STANDARDS.md`, or `CONTRIBUTING.md`) within the same changeset.

3. **Instruction hygiene:**
   Follow `.agents/skills/unslop`.
