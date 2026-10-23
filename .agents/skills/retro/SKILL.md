---
name: retro
description: Conduct a retrospective across sessions to surface recurring agent, tooling, and workflow problems.
disable-model-invocation: true
---

# Retrospective

Diagnose recurring problems across conversation transcripts, verify each against repository truth, and report unresolved problems.

## Execution rules

- Keep tracked repository files untouched throughout the retrospective.
- Store temporary analysis files strictly in the active session scratch directory; never write to system temporary paths like `/tmp`.
- Keep verification strictly read-only: inspect git logs, diffs, PR/issue states, config files, and CLI help. Never run full test suites, coverage runners, project linters, or build scripts during retrospective verification.
- Run transcript parsing scripts through single-quoted standard input heredocs such as `python3 - << 'EOF'` and use Python `json` module for data exchange.

## Steps

### 1. Scope and confirm conversations

1. Scan session transcripts in the active session log directory for timestamps, user turn counts, inline comments, non-zero command exits, and initial prompts.
2. Select main user conversations in the requested scope that contain follow-up user turns, inline comments, or non-zero command exits. Exclude child subagent sessions and single-turn side questions that lack follow-up feedback.
3. When the prompt omits a scope or matched conversations exceed five, output a chat response displaying a markdown table with candidate identifiers, dates, turn counts, and initial prompt excerpts. Conclude with a single line asking the user to confirm the target conversations, then halt and wait for the user reply.
4. Save confirmed conversation metadata to `candidates.json` in the session scratch directory.

Completion criterion: Confirmed target conversations saved in `candidates.json`.

### 2. Extract problems in batched subagents

The main agent manages a sliding window of batch subagents:

1. Read `candidates.json` and partition confirmed conversations into chronological batches of up to five conversations per batch.
2. Spawn up to five batch subagents in parallel. Pass each subagent its batch number, assigned conversation IDs, transcript paths, session scratch directory path, and instructions to execute Step 2 extraction.
3. As each subagent finishes, spawn the next queued batch subagent until all batches complete.
4. Maintain silence during reactive background notifications while subagents run. Do not output chat progress messages. When awakened by a subagent completion notification:
   - If queued batches remain, spawn the next queued batch subagent.
   - If all batches have already been spawned and other subagents are still in flight, **immediately yield execution without calling tools** (do not call `manage_subagents`, poll scratch files, or tail logs). The reactive system resumes execution automatically when remaining subagents complete.

Each batch subagent executes this extraction process at depth one without spawning subagents:

1. Parse assigned transcripts in a single Python pass (filtering for user prompts, tool errors, non-zero command exits, repetitive tool loops, and inline comments) to extract candidate problems, avoiding piecemeal line-by-line tool queries. Read full transcript logs (`transcript_full.jsonl`) only when a compact entry truncates necessary detail.
2. Write every distinct problem to `batch-<N>.json` in the session scratch directory and return the JSON array using this schema:

```json
[
  {
    "area": "agent | tooling | workflow",
    "observation": "Exact failure mode or friction, citing conversation ID, step numbers, tool calls, and triggering assistant action.",
    "impact": "Measured token cost, wasted turns, or failed attempts.",
    "user_notes": "Complete verbatim user corrections and inline comments from the transcript."
  }
]
```

Classify every extracted problem into one of three areas:

- **Agent.** Instruction drift, ignored rules, hallucinated context, unprompted scope expansion, broken links, premature actions, or repetitive tool loops.
- **Tooling.** Failing checks, redundant hooks, broken scripts, flawed skill instructions, invalid CLI flags, missing container binaries, or harness task-runner friction.
- **Workflow.** Diagnostic prompts missing error context, compound prompts that chain review, fixes, commits, and pull requests into a single turn, monolithic commits, or branch habits that cause rework. Treat brief approval replies on reviewed artifacts as normal progression.

Completion criterion: Every batch subagent finishes and writes its `batch-<N>.json` problem list.

### 3. Verify and write problem report

1. Merge and deduplicate all `batch-<N>.json` findings in chronological order into `merged_findings.json` using Python `json` module.
2. Aggregate recurring patterns and verify candidate problems against four sources of truth:
   - **Git history.** Check recent commit log and diffs with `git log -n 20 --stat` and `git show <sha>` to filter resolved issues.
   - **Pull requests and issues.** Check merged fixes and open issue checklists with `gh pr list --state all --limit 15` and `gh issue list --state all --limit 15`.
   - **Repository configuration.** Read `.agents/`, `CONTRIBUTING.md`, `package.json`, `lefthook.yml`, and `.github/workflows/` to distinguish intentional rules from defects.
   - **Package registry and CLI help.** Check versions and flags with `bun info <package>` and `<cli> --help`.
3. Retain verified problems that remain unresolved. Exclude resolved issues and omit solution proposals from the report.
4. Write the report to a unique file at `.scratch/retro/retrospective-<timestamp>.md` with a timestamp formatted as `YYYYMMDD-HHMMSS`. Group findings into three sections: **Agent problems**, **Codebase, tooling, and environment problems**, and **Developer workflow and prompting problems**. State the verified problem, transcript evidence, and impact for each item.
5. In the chat response, provide a brief pointer to the generated `.scratch/retro/retrospective-<timestamp>.md` file.

Completion criterion: Unique report file `.scratch/retro/retrospective-<timestamp>.md` written and referenced in chat.
