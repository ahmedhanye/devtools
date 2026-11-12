# Pull request comments

Guidelines for inspecting, investigating, and replying to pull request review comments.

## Reply-only policy

Branch protection requires review threads to be resolved before merge, but thread resolution belongs to the reviewer (human or AI reviewer bot).

Only post comment replies; never resolve review threads yourself. AI reviewers (such as CodeRabbit or Greptile) evaluate pushed commits and replies on their own and either resolve the thread or post a follow-up comment if the problem persists. Resolving a thread manually bypasses that check and hides unresolved feedback.

Never state that an issue is fixed until the commit containing the fix has already been pushed to the remote branch.

## Investigation and classification

Evaluate each open thread, including all follow-up replies and commits pushed since the last comment:

1. **Investigate code context.** Trace cited lines, surrounding logic, and all callers or dependencies across the repository.
2. **Verify against standards and domain rules.** Confirm whether the suggestion matches documented idioms, architectural patterns, and domain terms.
3. **Assess risk and future breakage.** Check whether the proposed change alters public contracts, degrades performance, breaks backward compatibility, or introduces subtle bugs.
4. **Classify disposition:**
   - **Valid defect:** A verified bug, regression, or standard breach. Fix the defect and add tests.
   - **False positive:** An invalid claim contradicted by codebase implementation, tests, ADRs, or external documentation. Prepare a clear technical refutation with file citations.
   - **Architectural trade-off:** Multiple valid approaches or scope questions. Document trade-offs for maintainer alignment.

## Actions you can take

### 1. Query unresolved review threads

Query open review threads, modified paths, line numbers, and comment database IDs:

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
            isResolved
            path
            line
            comments(first: 50) {
              nodes {
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

### 2. Reply to comments

Post a reply to the specific comment using its numeric `databaseId`, and leave the thread open so the reviewer can resolve it or follow up:

```bash
gh api repos/{owner}/{repo}/pulls/<pr_number>/comments/<comment_database_id>/replies -f body="<reply_body>"
```

> [!IMPORTANT]
> Never claim a comment is fixed until the commit fixing it has already been pushed to the remote branch, and never resolve the thread.

Provide an informative reply depending on how the comment was handled:

- For fixes, cite the pushed commit SHA (for example, `Addressed in <commit_sha>`).
- For false positives or declined suggestions, provide the technical rationale or citation.
- For design decisions or trade-offs, state the consensus or direction chosen.
