---
name: retro
description: Conduct a retrospective across sessions to surface recurring agent, tooling, and workflow problems.
disable-model-invocation: true
---

# Retrospective

Diagnose recurring problems across conversation transcripts, verify each against repository truth, and report unresolved problems.

## Execution rules

- Keep tracked repository files untouched throughout the retrospective.
- Delegate all transcript scanning and problem extraction to subagents that never modify repository files, using the default inherited model. Every subagent needs shell command execution. Use the `self` subagent type, or define a custom type with write tools enabled (shell access comes with them) and instruct it not to edit files. A custom type without write tools cannot run `scripts/cluster.ts`. The main agent spawns one subagent per group. Group subagents spawn batch subagents only when the harness permits nested spawning, and batch subagents never spawn. Subagents return findings in memory within their completion message. No agent reads a running subagent's transcript; it waits for the completion message.
- Only the main agent writes files, saving the final report to `.scratch/retro/retrospective-<YYYYMMDD-HHMMSS>.md` with the native file-writing tool as a workspace file rather than a session artifact.
- Keep verification strictly read-only. Inspect git logs, diffs, PR or issue states, config files, and CLI help without running test suites, coverage runners, linters, or build scripts.
- Run transcript parsing scripts through single-quoted standard input heredocs, `python3 - << 'EOF'`, and exchange data via standard JSON.
- Yield execution while subagents or background commands run by outputting a single-line status message with zero tool calls. Never run sleep commands, timers, or status-polling calls on background tasks or subagents.

## Problem classification

Classify every extracted problem into one of three areas:

- **Agent.** Instruction drift, ignored rules, hallucinated context, unprompted scope expansion, broken links, premature actions, or repetitive tool loops.
- **Tooling.** Failing checks, redundant hooks, broken scripts, flawed skill instructions, invalid CLI flags, missing container binaries, or task runner friction.
- **Workflow.** Diagnostic prompts missing error context, compound prompts that chain review, fixes, commits, and pull requests into a single turn, monolithic commits, or branch habits that cause rework. Treat brief approval replies on reviewed artifacts and pauses at required phase or git checkpoints as normal progression.

## Steps

### 1. Scope and cluster conversations

Dispatch a read-only scoping subagent as the first action of the session, leaving all log directory listing and transcript scanning to the subagent. After invoking the scoping subagent, output a single-line status message with zero tool calls and wait for its completion message. The scoping subagent runs the bundled script, which works for any agent whose sessions are JSONL files:

```bash
bun .agents/skills/retro/scripts/cluster.ts --agent <antigravity|claude|codex> --since <YYYY-MM-DD> --until <YYYY-MM-DD>
```

The script discards retro and skill-editing sessions, subagent runs, and sessions outside the window. It resolves PR numbers, issue references, and branch checkouts to canonical branches (through `gh pr list`, or `--prs-json` when `gh` is unavailable), expands each matched branch across adjacent days, and pools the remaining sessions into one standalone group. It prints the cluster plan as a JSON array:

```json
[
  {
    "group_id": 1,
    "topic": "Lighthouse core audit engine and persistence foundation",
    "branch_or_pr": "52-slice-lighthouse-core-audit-engine-persistence-foundation",
    "conversation_ids": ["uuid-1", "uuid-2", "uuid-3"],
    "turn_count": 49,
    "summary": "3 sessions, 2 non-zero exits, first 2026-10-24, last 2026-10-27"
  }
]
```

The subagent then sanity-checks the plan and returns it in memory:

1. Spot-check one group's transcripts to confirm the topic matches the work.
2. Replace each `topic` and `summary` with a brief description of the lifecycle reviewed, user corrections, and command failures.
3. For an agent without an adapter, or a log format the script misparses, add or fix an adapter in `scripts/cluster.ts` (each adapter normalizes one JSONL dialect) rather than scanning transcripts by hand.
4. Merge or split groups only when the script's branch resolution is demonstrably wrong.

Completion criterion: The main agent dispatches the scoping subagent as its first action, yields the turn, and receives the cluster plan JSON array in memory.

### 2. Publish candidate groups

1. Receive the in-memory cluster plan from the scoping subagent.
2. Render a markdown table with columns for Group ID, Topic, Branch or PR, Conversation Count, Total Turns, and Summary.
3. Continue to Step 3 in the same turn without waiting for user confirmation. The report does not repeat this table.

Completion criterion: The plan table is published in chat and the first group subagents are invoked in the same turn.

### 3. Extract problems in parallel subagents

Run exactly one group subagent per group. Never merge, split, or bundle groups to fit the window; queue the excess groups instead. Keep a sliding window of at most 6 concurrent group subagents. Six is the lowest default among major harnesses (Codex `agents.max_threads`). Raise the window to 10 only when the harness config or the user's request states the limit allows it.

1. Read the groups from memory. Invoke the first window-size groups in a single turn with parallel tool calls, one group per call. With 11 groups and a window of 6, invoke groups 1 to 6 now and groups 7 to 11 one at a time as slots free up. Pass each its group metadata, conversation IDs, transcript paths, and the extraction instructions below.
2. Immediately after invoking, end the turn by outputting a single-line status message with zero additional tool calls.
3. When awakened by a group completion message:
   - If groups remain queued, invoke the next one and end the turn with a single-line status message and zero other tool calls.
   - Otherwise end the turn with a single-line status message and zero tool calls. Completed subagents go idle and need no cleanup.
4. If a spawn is rejected with a concurrency-limit error, lower the window to the number of running subagents, queue the rejected group, and retry when one completes.
5. If a group subagent reports an error, retry that group once with a fresh subagent. After a second failure, record the group as unreviewed in the report and continue.
6. Proceed to Step 4 only after every group subagent has delivered its completion message.

Each group subagent owns its group end to end:

1. Divide the group into chronological batches of at most 4 conversations and 60 user turns each. A group within those limits is one batch.
2. Review the batches. When the harness permits nested spawning, spawn at most 2 concurrent batch subagents and wait for their completion messages. When a spawn is refused, or the group is one batch, review the batches yourself one after another.
3. Merge and deduplicate the batch findings into one JSON array and return it as the completion message.

Each batch review, whether run by a batch subagent or by the group subagent itself:

1. Parse assigned batch transcripts in a single Python pass, extracting user prompts, tool errors, non-zero command exits, repetitive tool loops, and inline comments. Read full transcript logs only when a compact entry truncates detail needed to diagnose a problem.
2. Track how problems evolve across sessions in the batch, recording where the user repeated instructions, corrected an approach, or re-explained context. Ignore transient compile, lint, or test errors that the agent fixed within the same session unless caused by a recurring tooling or instruction defect.
3. Return all distinct problems in memory within the completion message as a JSON array:

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

Completion criterion: Every group subagent completes and returns its merged problem list in memory.

### 4. Verify and write problem report

1. Merge and deduplicate all in-memory findings collected from the group subagents.
2. Correlate recurring patterns across groups where the same agent, tooling, or workflow problem appeared in multiple work units.
3. Verify candidate problems against four sources of truth:
   - **Git history.** Check recent commits and diffs with `git log -n 20 --stat` and `git show <sha>` to filter out transient implementation errors fixed before branch merge and issues already resolved on `main`.
   - **Pull requests and issues.** Check merged fixes and open issue checklists with `gh pr list --state all --limit 15` and `gh issue list --state all --limit 15`.
   - **Repository configuration.** Read `.agents/AGENTS.md`, relevant `.agents/skills/` definitions, `CONTRIBUTING.md`, `package.json`, `lefthook.yml`, and `.github/workflows/` to filter out behavior mandated by repository rules (such as pausing at phase or git checkpoints before committing) and confirm whether a reported tooling or configuration issue still exists in the current working tree.
   - **Package registry and CLI help.** Check versions and subcommand flags on the exact binary and subcommand used in the transcript (such as `gh stack sync --help` or `bun info <package>`).
4. Retain verified problems that remain unresolved, and only those seen in at least two sessions or backed by a repository-level source of truth. Exclude resolved issues and single-session anecdotes.
5. Omit solution proposals unless the user's request asks for improvements, research, or recommendations. In that case, add a fourth report section, **Improvement opportunities**, covering the areas the user named (for example GitHub and contribution habits, architecture, tooling, CI, verification). Ground each item in repository inspection or cited evidence, and keep it read-only.
6. Write the final report to `.scratch/retro/retrospective-<YYYYMMDD-HHMMSS>.md` using the current UTC date and time down to the second and the native file-writing tool (without artifact metadata). Group findings into three sections (plus the optional fourth): **Agent problems**, **Codebase, tooling, and environment problems**, and **Developer workflow and prompting problems**. State the verified problem, transcript evidence, and impact for each item.
7. Reply in chat with a clickable `file://` link to the report, followed by at most five one-line bullets naming the most impactful findings. Keep the reply under 15 lines and never restate report content.

Completion criterion: Unique report file `.scratch/retro/retrospective-<YYYYMMDD-HHMMSS>.md` written by the main agent, linked via `file://` URI, and summarized in chat.

