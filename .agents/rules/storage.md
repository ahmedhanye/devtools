---
trigger:
  - "**"
description: Ephemeral storage architecture, .scratch directory partitions, QA ref folders, UI session artifacts, and vendor skill supersedence rules.
---

# Storage and artifact rules

## Artifacts and scratchpad

1. **User-facing artifacts and session storage**: Ephemeral working files remain in workspace `.scratch/`, while user-facing visual structures (such as comprehensive reviews and plans) render in session storage as UI panel artifacts. When producing a user-facing artifact in the UI panel, write only a brief summary and pointer in the chat response; never repeat the full contents of the artifact in chat.
2. **Workspace scratchpad (`.scratch/`)**: Save all ephemeral working files, research spikes, transition handoffs, tickets, QA reports, and temporary scripts in `.scratch/`, partitioned strictly under:
   - `.scratch/scripts/`: One-off test, diagnostic, and benchmark scripts. Run from repository root (`bun run .scratch/scripts/<name>.ts`). Cleaned up when complete.
   - `.scratch/research/`: Spikes, investigations, and background notes.
   - `.scratch/handoff/`: Session transitions, specs, and implementation plans.
   - `.scratch/issues/`: Drafted GitHub issues, local ticket breakdowns, and PR descriptions.
   - `.scratch/qa/<ref>/`: QA folders grouping paired review files (e.g. `code-review.md` and `QA.md`) for the sanitized git reference `<ref>`.
3. **Executable standalone binaries**: Save compiled standalone executables strictly in repository root `dist/`. Pull request descriptions cite only permanent codebase paths.

## Host `/tmp` prohibition and vendor skill supersedence

1. **Host temp prohibition**: Never write to, copy to, or execute commands in host OS temporary directories (`/tmp`, `$TMPDIR`, `%TEMP%`).
2. **Vendor skill override**: Repository storage rules strictly supersede all vendor skills. When a vendor skill instructs saving to OS temporary paths, redirect the write to the purpose-specific partition in `.scratch/` (such as `.scratch/scripts/` for scripts, `.scratch/research/` for spikes, `.scratch/handoff/` for transitions, `.scratch/issues/` for issue drafts, or `.scratch/qa/<ref>/` for review files).
3. **Path portability**: Reference files and scripts exclusively using repository-relative paths (e.g. `.scratch/handoff/...`). Never embed or commit absolute machine paths.
