---
name: comments-review
description: Review unresolved pull request comments from humans and bots in a dedicated subagent. Use when asked to review PR comments, triage review feedback, or inspect comments on an open pull request.
---

# Review pull request comments

Triage unresolved pull request review threads against repository truth: architecture decision records, domain glossaries, diffs, and codebase files. A dedicated subagent fetches threads, investigates the codebase, verifies claims, and authors the report artifact. The primary session remains lightweight, avoids context pollution, and presents the generated artifact to the user.

## Rules

1. **Subagent isolation.** The primary session never fetches diffs, executes GraphQL queries, reads source files, or investigates comments. It dispatches a dedicated subagent with the target pull request reference and the session artifact directory. The subagent performs the entire investigation and writes the report artifact.
2. **Repository truth over reviewer opinion.** Treat every bot and human comment as an unverified opinion. Verify claims against the pull request diff, file contents, active records under `docs/adr/`, domain glossaries under `docs/glossary/`, and automated tests.
3. **Artifact-first delivery.** The subagent authors a structured markdown report artifact with full investigation details and evidence. The primary session presents the artifact link and a brief summary without running interactive interview rounds or grilling sessions.

## Workflow

### 1. Primary coordinator

When invoked in the primary session:

1. Identify the pull request target from the prompt (a PR number or URL). If omitted, instruct the subagent to infer the PR from the active branch.
2. Do not run git diffs, file reads, or GitHub CLI queries in the primary session.
3. Dispatch a dedicated subagent using `invoke_subagent`:
   - `TypeName`: `self`
   - `Role`: `Pull Request Comments Reviewer`
   - `Prompt`: Provide the pull request target, the session artifact directory path, context pointers to `docs/adr/`, `GLOSSARY-MAP.md`, and `docs/contributing/pull-requests.md`, and instructions to run the full review process and create the UI artifact report `pr_<number>_comments_review.md`.
4. Stop tool calls immediately and wait for the subagent to finish.
5. Upon resumption, present the report artifact link and a concise summary table of categorized findings.
6. Await explicit user confirmation before applying fixes or resolving threads on GitHub.

Completion criterion: The primary session dispatches the subagent, halts tool execution, and presents the generated report artifact link alongside a summary table upon resumption.

### 2. Subagent reviewer

When running inside the dispatched subagent:

1. **Verify the pull request.** Confirm the pull request number and verify it is open via `gh pr view <number>`. Stop if closed or merged.
2. **Fetch unresolved review threads.** Run the GraphQL query from `docs/contributing/pull-requests.md` to extract all unresolved review threads, comment IDs, authors, paths, line numbers, and comment bodies. If zero unresolved threads exist, report that all threads are resolved and stop.
3. **Assemble repository truth.**
   - Pull request diff: inspect via `gh pr diff <number>`.
   - Linked issues: check for `Closes #<issue>` in the pull request description.
   - Architectural decisions: inspect `docs/adr/` and `GLOSSARY-MAP.md`.
   - Domain glossaries: inspect `docs/glossary/` and `GLOSSARY-MAP.md`.
   - Commit history: inspect commits on the branch against `main`.
4. **Investigate each review thread.**
   - For every unresolved thread, inspect the cited file and lines in the repository.
   - Run verification checks, tests, or search relevant documentation to determine whether each reported problem is real.
   - Categorize each thread into one of four dispositions:
     - **Valid defect**: A verified bug, regression, or contract breach. Record thread ID, comment author, path, line number, problem explanation, verification proof, and exact code fix.
     - **False positive**: An invalid claim contradicted by codebase implementation, ADRs, or glossaries. Record thread ID, comment author, path, line number, technical refutation with file citations, and proposed reply.
     - **Ignorable suggestion**: A non-binding stylistic preference or out-of-scope idea. Record thread ID, comment author, path, line number, and reason for dismissal.
     - **Architectural trade-off**: An ambiguous design choice or maintainer decision. Record thread ID, comment author, path, line number, competing options, trade-offs, and a recommended direction.
5. **Author the review artifact.**
   - Write `pr_<number>_comments_review.md` in the session artifact directory with `write_file` and `ArtifactMetadata`:
     - `Summary`: Multi-line summary of findings and counts.
     - `UserFacing`: `true`
     - `RequestFeedback`: `false`
   - Include overview metrics, diff statistics, and detailed sections for each of the four dispositions with complete investigation notes.
6. **Return completion message.** Reply to the primary coordinator with the artifact path, artifact link, and a count of threads per disposition.

Completion criterion: The subagent completes all thread investigations, creates `pr_<number>_comments_review.md` in session storage with artifact metadata, and sends a completion message with the artifact path and summary.

### 3. Thread resolution

Apply changes only after the user explicitly confirms the findings and approves execution:

1. **Apply fixes for valid defects.** Implement the recommended code changes, run automated test suites (`bun test`), and commit changes following atomic commit conventions.
2. **Resolve GitHub review threads.** For each resolved valid defect and refuted false positive:
   - Post a technical reply comment via the GitHub REST API:
     ```bash
     gh api repos/{owner}/{repo}/pulls/<pr_number>/comments/<comment_id>/replies -f body="<reply_body>"
     ```
   - Resolve the thread via the GitHub GraphQL API:
     ```bash
     gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread_id>"}) { clientMutationId } }'
     ```
3. **Handle trade-offs and suggestions.** Leave ambiguous threads open or post maintainer notes as directed by user confirmation.

Completion criterion: All approved code fixes are committed, tests pass, and corresponding GitHub review threads are resolved.
