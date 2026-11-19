# Pull request comments

Guidelines for inspecting, investigating, and replying to pull request review threads.

## Reply-only policy

Branch protection requires review threads to be resolved before merge, but thread resolution belongs exclusively to the reviewer (human or automated review bot).

Post comment replies only; never resolve review threads yourself. Automated reviewers (such as CodeRabbit or Greptile) inspect pushed commits and replies on their own and resolve or follow up independently.

> [!IMPORTANT]
> Never state that a review comment is fixed until the commit containing the fix has been pushed to the remote branch, and never resolve the thread manually.

## Investigation and classification

Evaluate each open thread along with all follow-up replies and commits pushed since the last comment:

1. **Investigate code context.** Trace cited lines, surrounding logic, and all callers or dependencies.
2. **Verify against standards and domain rules.** Confirm whether the claim matches repository coding standards, ADRs, and canonical glossary terms.
3. **Assess risk.** Check whether the proposed change alters public contracts, degrades performance, or introduces subtle regressions.
4. **Classify disposition:**
   - **Valid defect.** Verified bug, regression, or standard breach. Fix the defect and add tests.
   - **False positive.** Claim contradicted by codebase implementation, tests, ADRs, or primary specs. Prepare a concise technical refutation with file citations.
   - **Architectural trade-off.** Multiple valid designs or scope questions. Document trade-offs for maintainer alignment.

## Actions

### 1. Query unresolved review threads

```bash
gh api graphql --paginate -F owner='{owner}' -F repo='{repo}' -F pr=<pr_number> -f query='
  query($owner: String!, $repo: String!, $pr: Int!, $endCursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100, after: $endCursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            isResolved path line
            comments(first: 50) {
              nodes { databaseId author { login } body createdAt }
            }
          }
        }
      }
    }
  }' --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)'
```

### 2. Reply to a review comment

Reply using the comment's numeric `databaseId` and leave the thread open:

```bash
gh api repos/{owner}/{repo}/pulls/<pr_number>/comments/<comment_database_id>/replies -f body="<reply_body>"
```

- **For fixes.** Cite the pushed commit SHA (for example, `Addressed in <commit_sha>`).
- **For false positives or declined suggestions.** Provide the technical rationale and file citation.
- **For design trade-offs.** State the chosen direction and reasoning.
