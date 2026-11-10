# Pull request comments and thread resolution

Guidelines for inspecting, investigating, and resolving pull request review comments.

## Branch protection requirements

Branch protection requires all review threads opened by reviewers or automated review bots (such as CodeRabbit) to be resolved before merge eligibility.

Never mark a thread as resolved or state that an issue is fixed unless the suggestion is intentionally declined or the commit containing the fix has already been pushed to the remote branch. Resolving threads prematurely conceals unresolved feedback and leaves the remote pull request diff out of sync with reviewer comments.

## Investigation and classification

Evaluate each review comment to determine whether the suggested change is valid or whether it introduces regressions:

1. **Investigate code context.** Trace cited lines, surrounding logic, and all callers or dependencies across the repository.
2. **Verify against standards and domain rules.** Confirm whether the suggestion matches documented idioms, architectural patterns, and domain terms.
3. **Assess risk and future breakage.** Check whether the proposed change alters public contracts, degrades performance, breaks backward compatibility, or introduces subtle bugs.
4. **Classify disposition:**
   - **Valid defect:** A verified bug, regression, or standard breach. Fix the defect and add tests.
   - **False positive:** An invalid claim contradicted by codebase implementation, tests, ADRs, or external documentation. Prepare a clear technical refutation with file citations.
   - **Architectural trade-off:** Multiple valid approaches or scope questions. Document trade-offs for maintainer alignment.

## Actions you can take

### 1. Query unresolved review threads

Query open review threads, modified paths, line numbers, thread IDs, and comment database IDs:

```bash
gh api graphql --paginate -F owner='{owner}' -F repo='{repo}' -F pr=<pr_number> -f query='
  query($owner: String!, $repo: String!, $pr: Int!, $endCursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100, after: $endCursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
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

### 2. Reply and resolve threads

Reply to the specific comment using its numeric database ID, then resolve the thread using its GraphQL node ID.

> [!IMPORTANT]
> Never claim a comment is fixed or resolve a thread unless the suggestion is intentionally declined or the commit fixing it has already been pushed to the remote branch.

- **Replying to a comment:**
  ```bash
  gh api repos/{owner}/{repo}/pulls/<pr_number>/comments/<comment_database_id>/replies -f body="<reply_body>"
  ```
- **Resolving a review thread:**
  ```bash
  gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread_node_id>"}) { clientMutationId } }'
  ```

Provide an informative reply depending on how the comment was handled:

- For fixes, cite the pushed commit SHA (for example, `Addressed in <commit_sha>`).
- For false positives or suggestions declined, provide the technical rationale or citation.
- For design decisions or trade-offs, state the consensus or direction chosen.
