---
name: retro
description: Conduct a retrospective on one or more sessions to diagnose agent, tooling, and workflow problems.
disable-model-invocation: true
---

# Retrospective

Diagnose agent, tooling, and workflow problems from conversation transcripts, verify each against repository truth, and report unresolved findings with mechanical guardrails.

## Rules

1. **Direct execution.** Run the retrospective directly in the active session. Retaining transcript findings in working memory enables immediate discussion, rebuttal, and clarification without secondary investigations.
2. **Comprehensive problem scope.** Diagnose all verified problems across the target sessions, whether analyzing a single session, a pull request, or a multi-week milestone. Never drop a valid problem because it occurred only once. When analyzing multiple sessions, label whether each problem is an isolated incident or a recurring pattern across sessions.
3. **Repository truth over transcript claims.** Verify candidate problems against git history, pull request status, repository configuration files, and command line help before reporting them. Discard already-resolved bugs and false positives.
4. **Mechanical checks over text rules.** Prioritize automated guardrails, such as Lefthook pre-commit hooks, linter rules, TypeScript compiler options, and CI workflow checks, before suggesting additions to `.agents/AGENTS.md`. Pair every recommendation with an executable verification command.
5. **Read-only verification.** Keep repository files untouched. Inspect git logs, diffs, configuration files, and CLI help without executing test runners, linters, or build scripts.

## Workflow

### 1. Scope sessions and locate transcripts

1. Identify the retrospective target from the user prompt:
   - *Fast-path mode (single session or PR)*: Read the specified session transcript or locate transcripts for the PR branch directly from disk.
   - *Milestone mode (date range or milestone)*: Run the clustering script to identify transcripts and group them by branch or pull request:
     ```bash
     bun .agents/skills/retro/scripts/cluster.ts --agent <antigravity|claude|codex> --since <YYYY-MM-DD> --until <YYYY-MM-DD>
     ```
2. Default to the current session if no target is specified.

Completion criterion: Target session transcripts identified and clustered by branch or pull request.

### 2. Extract and verify problems

1. Scan transcripts in a single pass for failure signals:
   - *User corrections and pushbacks*: Any turn where the user intervened, corrected code, redirected the approach, or expressed frustration. Verbatim user corrections are ground truth for agent failure.
   - *Tool and environment seams*: Command failures, non-zero exits, invalid CLI flags, deprecated APIs, missing environment variables, or editor crashes.
   - *Agent loops and drift*: Repetitive tool calls without progress, hallucinated commands, or unprompted scope expansion.
   - *Workflow friction*: Broken handoffs, draft pull request stalls, or confirmation fatigue.
   - *Healthy cycles vs flailing*: Discard routine test-driven development cycles where an agent runs a failing test, edits code, and passes the test. Discard internal model thinking traces and evaluate external actions.
2. Verify candidate problems against git history and repository tracking:
   - *Git history*: Inspect recent commits and diffs with `git log -n 20 --stat` and `git show <sha>` to filter out issues already resolved on main.
   - *Pull requests and issues*: Check `gh pr list --state all --limit 15` and `gh issue list --state all --limit 15`.

Completion criterion: Candidate problems extracted, verified against repository sources of truth, and filtered.

### 3. Author report and invite feedback

1. Write the report to `.scratch/retro/retrospective-<YYYYMMDD-HHMMSS>.md` with the current UTC timestamp down to the second.
2. Structure the report with:
   - **Executive Action Matrix**: Prioritize mechanical checks into `P0` (critical / security / broken CI), `P1` (high friction / silent quality decay), and `P2` (ergonomics / hygiene), mapping each to an explicit verification command.
   - **Detailed Findings**: Group findings into **Agent problems**, **Codebase, tooling, and environment problems**, and **Developer workflow and prompting problems**. For each finding, document the verified problem, transcript evidence, frequency (single incident or recurring pattern), impact, and recommended mechanical check.
3. Reply in chat with the report path, present the top `P0`/`P1` action table directly in the response, and invite user feedback. Ask the user to review the report and reply with feedback on the findings so we can start grilling. **Stop here and end your turn. Wait for the user to reply before starting step 4.** Keep the chat response under 15 lines.

Completion criterion: Report written to `.scratch/retro/` and summary presented in chat with prioritized action table and feedback request.

### 4. Grill on findings

Read [`.agents/skills/grilling/SKILL.md`](../grilling/SKILL.md) to resolve user feedback, disputed findings, and guardrails with genuine design trade-offs.

Completion criterion: Open questions on proposed guardrails resolved with the user.
