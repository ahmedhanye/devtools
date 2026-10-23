# Pull requests and code review

Guidelines for creating, reviewing, resolving threads, and merging pull requests.

## Triage and inspection

External pull requests are not treated as feature requests. New capabilities must begin as issues.

When inspecting pull requests:

- **Read a PR:** `gh pr view <number> --json number,title,body,labels,comments` and `gh pr diff <number>` for the diff.
- **List PRs:** `gh pr list --state open --json number,title,body,labels,author,comments`

### GitHub CLI operational notes

- **File-filtered PR diffs:** `gh pr diff <number>` does not accept path arguments. To inspect specific files on a PR branch, run `git diff origin/main...HEAD -- <path>`.
- **Check run exit codes:** `gh pr checks <number>` exits with code `8` when CI checks are pending or in progress; use `gh pr checks <number> --watch` to await completion.

## Pull request rules

1. **Link the tracking issue:** `gh issue develop` links the issue automatically. When creating manually, add `Closes #<issue>` to the pull request description.
2. **Self-assign the pull request:** Assign yourself as the Directly Responsible Individual (DRI) when opening a pull request by passing `--assignee "@me"` (maintainer review is automatically requested via `CODEOWNERS`).
3. **Follow the pull request structure:** PR descriptions must describe user-facing changes to `main` following [.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md) (Summary with structural diff/tree, Evidence, and Merge Danger). Pull request descriptions cite permanent codebase paths and omit ephemeral workspace `.scratch/` paths, raw session logs, and agent execution notes.
4. **Provide verification evidence:** Include terminal test output, commands, or observable behavior confirming all acceptance criteria.
5. **Verify tracking issue checklist:** Before opening the pull request, inspect the linked ticket description (`gh issue view <ticket_number>`) and its parent Spec description (`gh api repos/{owner}/{repo}/issues/<ticket_number>/parent --jq .number 2>/dev/null`) to confirm all acceptance criteria are met. Update completed task checkboxes from `- [ ]` to `- [x]` in the ticket and parent Spec descriptions via `gh issue edit <number> --body "$UPDATED_BODY"`.
6. **Open the pull request non-interactively:** Create the pull request using explicit title and body flags or `--fill` to avoid interactive terminal prompts:
   ```bash
   gh pr create --assignee "@me" --fill
   ```
   If maintaining tracking status on a GitHub Project:
   ```bash
   ITEM_ID=$(gh project item-add <project_number> --owner <owner> --url "https://github.com/<owner>/<repo>/issues/<ticket_number>" --format json --jq .id 2>/dev/null || true)
   if [ -n "$ITEM_ID" ]; then
     gh project item-edit --id "$ITEM_ID" --project-id "<project_id>" --field-id "<status_field_id>" --single-select-option-id "<in_review_option_id>"
   fi
   ```

## Review thread resolution

Branch protection enforces required review thread resolution. All comment threads opened by reviewers or automated review bots (such as CodeRabbit) must be resolved before merge eligibility.

### 1. Inspect unresolved review threads

Query open review threads, diff locations, authors, and conversation nodes via GitHub GraphQL:

```bash
gh api graphql -F owner='{owner}' -F repo='{repo}' -F pr=<pr_number> -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            path
            line
            comments(first: 50) {
              nodes {
                id
                databaseId
                author { login }
                body
                createdAt
              }
            }
          }
        }
      }
    }
  }' --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'
```

### 2. Resolution workflows

- **Valid defect:** Implement the code fix, confirm tests pass, post a comment referencing the fix commit, and resolve the thread via GitHub GraphQL:
  ```bash
  gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread_node_id>"}) { clientMutationId } }'
  ```
- **False positive or invalid suggestion:** Post a technical comment detailing why the remark is invalid or contradicts repo design, and resolve the thread via GraphQL.
- **Ambiguous or high-risk finding:** Leave the thread open, post a comment explaining the architectural trade-off or risk, and request maintainer review.

### 3. Commit-time review thread resolution

When committing changes or pushing additional work to an active pull request:

1. **Query open threads:** Inspect unresolved review threads using the GraphQL query above.
2. **Correlate changes:** Compare modified files and lines in your commits against unresolved thread paths and line positions.
3. **Verify resolutions:** Run fast verification tests (`bun run verify:fast` or `bun test`) to ensure the changes address the feedback without regressions.
4. **Post reply and resolve:** Post a comment referencing the commit SHA that resolves the comment and mutate the thread to resolved via GitHub GraphQL:
   ```bash
   gh api repos/{owner}/{repo}/pulls/<pr_number>/comments/<comment_id>/replies -f body="Addressed in <commit_sha>"
   gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread_node_id>"}) { clientMutationId } }'
   ```
5. **Handle ambiguous threads:** If a review comment represents an architectural discussion, design ambiguity, or requires maintainer decision, leave the thread open, explain the trade-off in a reply, and request maintainer review.

## Merging pull requests

Squash merge into `main` after all review threads and status checks pass:

```bash
gh pr merge <pr_number> --squash --delete-branch
```

Linear history with squash merging is enforced by repository rulesets.
