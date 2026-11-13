---
name: retro
description: Conduct a retrospective on one or more sessions to diagnose agent, tooling, and workflow problems.
disable-model-invocation: true
---

# Retrospective

Diagnose single-session or multi-session friction across conversations, skills, tooling, and documentation.

## Rules

1. Run directly in the active session unless explicitly told to delegate.
2. Verify every transcript claim against current repository files, git history, or CI state before reporting it.
3. Prefer mechanical checks (linters, schema validation, hooks, CI gates, test assertions) over adding prose rules.
4. Keep tracked files and git state unmodified during diagnosis until the user approves changes.
5. Keep full evidence and action tables in the report file rather than duplicating them in chat.

## Workflow

### 1. Gather scope and session digests

Run `.agents/skills/retro/scripts/cluster.ts` instead of writing ad-hoc log parsers:

- Cluster by time window or branch: `bun .agents/skills/retro/scripts/cluster.ts --since <YYYY-MM-DD> --format md` (supports `--days <N>`, `--branch <name>`, `--pr <number>`, `--query <text>`, and `--agent auto` by default).
- Inspect target sessions: `bun .agents/skills/retro/scripts/cluster.ts --session <id[,id2]> --inspect --format md` to extract cleaned user turns, correction signals, command failures, harness errors, polling/hook-bypass/interactive counts, executed check counts, compactions, and child subagents.
- Pass `--include-retro` when auditing past retrospective sessions themselves, and `--all-repos` for cross-repo sessions.
- Read raw transcript logs only when `--inspect` highlights a step, failure, compaction, or child subagent needing deeper context.

### 2. Analyze and verify root causes

- Group verified problems across workflow, skills, instructions, hooks, CI, and tests.
- Check whether cited scripts, rules, docs, or tests already changed since the session ran.
- Inspect child subagent summaries and harness errors alongside user corrections to uncover silent failures and missing automated checks.

### 3. Write the retrospective report

Save the full report to `.scratch/retro/retrospective-<YYYYMMDD-HHMMSS>.md` (or a temporary session file outside tracked repository paths if `.scratch/` is unavailable):

- Scope, date window, session counts by harness, and inspected conversation IDs.
- Verified findings with session step evidence, current repository paths, and root causes.
- P0 to P3 prioritized recommendations favoring mechanical checks over prose.
- Open trade-offs, scope choices, or priority decisions needing user input.

In chat, summarize only the top P0/P1 findings and link the report file.

### 4. Settle open decisions

If open trade-offs or implementation decisions remain before editing, follow [the grilling skill](../grilling/SKILL.md) to resolve them without duplicating report tables or adding redundant inline questions. Otherwise wait for user approval before modifying files.
