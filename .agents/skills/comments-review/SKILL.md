---
name: comments-review
description: Review open pull request comments against repository truth and write a scannable action report. Use when reviewing PR comments, triaging reviewer feedback, or auditing unresolved PR threads.
---

# Review pull request comments

Audit open pull request review threads against repository truth and write an action report for user approval. Leave repository files, git state, and GitHub threads untouched during the review.

## Workflow

1. **Fetch open threads.** Query unresolved threads for the target PR or active branch PR. Read every comment and follow-up reply in each thread alongside commits pushed after the comment. Stop and report if zero threads are open.
2. **Research and verify.** Trace cited lines, callers, types, tests, coding standards, ADRs, and glossaries, and verify all claims and recommendations against primary sources using [`../research/SKILL.md`](../research/SKILL.md). Check for regressions and broken contracts, then classify each thread as a valid defect, architectural trade-off, or false positive.
3. **Write the report.** Save `pr_<number>_comments_review.md` in the session artifact directory using the format below, then present the link and summary table in chat.

## Report format

Keep the report short, scannable, and action-first. Cite each location once as `path:line` rather than repeating inline links on every symbol, omit GraphQL thread IDs, and skip large code blocks unless a short snippet prevents ambiguity.

- **Header.** Include the PR link, branch, and one-line verdict counts (for example, `2 open: 1 valid defect, 1 false positive`).
- **Summary table.** Use columns `| # | File | Issue | Author | Verdict | Next step |`.
- **Findings.** Group by `Valid defects`, `Architectural trade-offs`, then `False positives`, omitting empty groups. Format each thread with:
  - Heading `### <N>. <Short title> (<Verdict>)` and metadata line `<path>:<line> | <author>`.
  - **Reviewer claim.** State what the reviewer flagged, including any follow-up reply, in one or two sentences.
  - **Verification.** List short bullets with load-bearing facts, root cause or refutation, and exact citations or reproduction results.
  - **Next step.** State the fix and test target for a defect, competing options with a recommendation for a trade-off, or the reason to decline a false positive.

Completion criterion: `pr_<number>_comments_review.md` is written to the session artifact directory, its summary table is shown in chat, and repository files and GitHub threads remain untouched.
