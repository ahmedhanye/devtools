---
name: comments-review
description: Review open pull request comments against repository truth and settle actions for each thread. Use when reviewing PR comments, triaging reviewer feedback, or auditing unresolved PR threads.
---

# Review pull request comments

Audit open pull request review threads against repository truth and settle dispositions before making changes. Leave repository files, git state, and GitHub threads untouched during the review.

## Workflow

1. **Fetch open threads.** Following `CONTRIBUTING.md` and its linked PR comment guide, query unresolved threads and top-level review summaries for the target PR or active branch PR. Read every comment and follow-up reply in each thread alongside commits pushed after the comment. Stop and report if zero threads are open.
2. **Research and verify.** Trace cited lines, callers, types, tests, `CODING_STANDARDS.md`, `ARCHITECTURE.md` (including linked ADRs), and `GLOSSARY.md`, and verify technical or external claims against primary sources using [`../research/SKILL.md`](../research/SKILL.md). Check for regressions and broken contracts, then classify each thread as a valid defect, architectural trade-off, or false positive.
3. **Present findings via grilling.** Frame open threads, options, and grounded recommendations using [`../grilling/SKILL.md`](../grilling/SKILL.md).

Completion criterion: All open threads are verified, the grilling session artifact is written and linked in chat, and repository files and GitHub threads remain untouched.
