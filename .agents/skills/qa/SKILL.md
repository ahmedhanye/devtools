---
name: qa
description: Run a black-box, gray-box, and white-box quality assurance review. Use when verifying code changes or a repository across all three boxes or a requested subset, auditing test quality, or running a QA workflow.
---

Run a quality assurance review across black-box, gray-box, and white-box domains while keeping tracked repository files untouched. Default to all three boxes, or run only the requested subset when the user asks for specific boxes.

## Coordinator workflow

### 1. Resolve scope, boxes, and context

Determine which boxes to run (all three by default, or only the requested subset) and identify the review scope using read-only, non-interactive commands (diff against a base ref, working tree edits, target directory, or full repository).

Choose one output directory such as `.scratch/qa/<timestamp>-<slug>/` using UTC `YYYY-MM-DDTHH-MM-SSZ` and a kebab-case slug, or an isolated OS temporary directory when `.scratch/` is not used.

- For **Gray-box** and **White-box** (when selected), write `<out_dir>/context.md` with the base ref, `git status -s`, exact changed-file list (`git diff --name-status <base-ref>`), issue or PR context, and relevant `GLOSSARY.md` terms and `ARCHITECTURE.md` ADRs.
- For **Black-box** (when selected), write a separate `<out_dir>/black-box-context.md` containing only plain-language user-facing behavior changes, public entrypoints (CLI commands, UI routes, HTTP endpoints), acceptance criteria, and E2E, UI, or binary test commands. Exclude internal source paths, build configs, test file internals, and ADR references.

Completion criterion: Selected boxes, target scope, and required context files are ready for subagent dispatch.

### 2. Dispatch selected box subagents

Assign non-overlapping commands and files by lens so shared artifact-mutating steps (such as full coverage or binary builds) have one owner, and keep `references/` playbooks unread by the coordinator unless running boxes sequentially:

| Box           | Playbook                                                           | Assigned inputs and report path                                                                                                                                     |
| :------------ | :----------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Black-box** | [references/black-box-testing.md](references/black-box-testing.md) | `black-box-context.md`, public entrypoints, and E2E, UI, or binary commands; writes `<out_dir>/black-box-testing.md`                                                |
| **Gray-box**  | [references/gray-box-testing.md](references/gray-box-testing.md)   | `context.md`, integration test files, module seams, wire contracts, architecture, and security checks; writes `<out_dir>/gray-box-testing.md`                       |
| **White-box** | [references/white-box-testing.md](references/white-box-testing.md) | `context.md`, non-exempt source files, unit, E2E, and UI story test files, coverage, static analyzers, and mutation runner; writes `<out_dir>/white-box-testing.md` |

Launch selected subagents in parallel (or run each selected playbook sequentially if parallel delegation is unavailable). Pass each subagent [the shared protocol](references/subagent-protocol.md), its box playbook, its assigned context file, owned commands, and exact target report path `<out_dir>/<box>-testing.md`. Wait for all selected subagents to finish, verify every expected `<out_dir>/<box>-testing.md` file exists, and run any sequential post-coverage binary smoke check after parallel runs complete.

Completion criterion: Every selected `<out_dir>/<box>-testing.md` report exists and all subagent handoffs are received.

### 3. Synthesize and report in chat

Read all subagent handoffs and written reports in parallel, and deduplicate findings across boxes under their primary owner. Do not write a separate combined summary file on disk.

Reply in chat with a clean, scannable combined dashboard:

- **Overall verdict:** `Pass`, `Pass with notes`, or `Action required`.
- **Scorecard table:** One row per box that ran (`Box`, `Verdict`, `Checks`, `Proven issues`, `Second-look hints`).
- **Proven issues:** Deduplicated list of confirmed defects, missing tests, surviving mutants, or standards violations (omit if none).
- **Worth a second look:** Combined list of suspicious logic, comment mismatches, brittle tests, or UX/contract hints worth human review (omit if none).
- **Human checks needed:** Copy-pasteable manual checks when automated checks cannot verify sensory or credentialed behavior (omit completely when automated checks verified everything).
- **Reports:** Links to all written `<out_dir>/<box>-testing.md` files.

Completion criterion: Combined chat summary delivered with deduplicated findings and links to all written box reports.
