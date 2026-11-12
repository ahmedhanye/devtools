---
name: qa
description: Run a three-axis quality assurance review across black-box, gray-box, and white-box domains. Use when verifying code changes or a full repository across all test levels, auditing test oracle and contract quality, or running a QA workflow.
---

Run a three-axis quality assurance review across any repository while keeping tracked repository files untouched.

## Coordinator workflow

### 1. Capture review scope and output directory

Identify the review scope from the user request and repository state using non-interactive read-only commands, covering diff-scoped changes against a base ref, working tree edits, a target directory, or a full-repository inventory. Gather the target file list along with any explicitly referenced issue or pull request metadata.

Choose one run directory for the review, such as `.scratch/qa/<timestamp>-<slug>/` using UTC YYYY-MM-DDTHH-MM-SSZ format and a kebab-case slug, or an isolated OS temporary directory when the repository does not designate `.scratch/`. Write `<out_dir>/context.md` with the base ref, git status, target file list, and issue context whenever the scope spans multiple files so subagents skip duplicate discovery.

Completion criterion: Review scope, target file list, and `<out_dir>/` are ready for subagent dispatch.

### 2. Dispatch three axis subagents

Assign candidate source and test files loosely by inspection lens so each axis starts cleanly without reading testing guides, build manifests, or build scripts up front:

| Axis | Playbook | Focus and report path |
| :--- | :--- | :--- |
| **Black-box** | [references/black-box-testing.md](references/black-box-testing.md) | Public interfaces, CLIs, binaries, and end-to-end or user workflows; writes `<out_dir>/black-box-testing.md` |
| **Gray-box** | [references/gray-box-testing.md](references/gray-box-testing.md) | Module seams, API and wire contracts, persistence, security boundaries, and architecture checks; writes `<out_dir>/gray-box-testing.md` |
| **White-box** | [references/white-box-testing.md](references/white-box-testing.md) | Internal branches, unit suites, static analyzers, complexity, coverage, and mutation checks; writes `<out_dir>/white-box-testing.md` |

Launch all three subagents in parallel, or run each playbook sequentially if parallel delegation is unavailable. Pass each subagent [the shared protocol](references/subagent-protocol.md), its axis playbook, the scope summary or `<out_dir>/context.md` path, base ref, candidate files, and the exact target report path `<out_dir>/<axis>-testing.md`. Wait for all three subagents to finish before reading reports.

Completion criterion: All three report files exist at the assigned `<out_dir>/<axis>-testing.md` paths.

### 3. Synthesize and report

Read all three reports in parallel, deduplicate findings across axes under their primary owner, and confirm the final summary matches every checked outcome. Reply with at most 15 lines covering:

- Pass and fail test counts, static analysis outcomes, and coverage totals across all three axes.
- Deduplicated defects, missing tests, surviving mutants, and standards violations.
- Links to all three written reports inside `<out_dir>/`.
- Any human verification checks required, omitting that bullet completely when automated checks verified all modified behavior.

Completion criterion: Deduplicated summary of at most 15 lines delivered with links to all three written reports.
