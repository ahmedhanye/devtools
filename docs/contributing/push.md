# Pushing changes and review synchronization

Guidelines for verifying branch readiness, executing remote pushes, correlating pull requests, and resolving review comments after pushing.

## Pre-push quality gate

Before pushing to the remote repository, ensure all local verification checks pass:

```bash
bun run verify:fast
```

For major milestones, slices, or before opening a final pull request, run the full verification suite:

```bash
bun run verify
```

## Git checkpoint and user confirmation

Per repository guidelines, agents and contributors must obtain explicit user confirmation before executing `git push`, branch merges, or mutating stacks (`gh stack push`, `gh stack submit`, `gh stack sync`).

When pausing for confirmation, inspect the branch state and present both staged and unstaged changes for review:

```bash
git status
git diff --stat origin/main...HEAD
```

## Remote push execution

Execute pushes non-interactively:

- **Standard branch push:**
  ```bash
  git push origin <branch>
  ```
- **Stacked PR branches (`gh-stack`):**
  Always pass `--yes` to avoid interactive confirmation prompts when pruning or updating stacked branches:
  ```bash
  gh stack sync --yes
  ```

## Active pull request inspection

After pushing to the remote repository, check if an open pull request already exists for the active branch:

```bash
gh pr list --head $(git branch --show-current) --json number,title,state,url
```

If no pull request exists yet, follow [Pull requests and code review](pull-requests.md) to open one when ready.

## Post-push review thread resolution

Branch protection requires all review comment threads to be resolved before merge eligibility. Review threads must only be resolved **after** the corresponding code fix has been committed and successfully pushed to GitHub. This ensures the pull request diff on GitHub displays the updated code.

### 1. Query open review threads

Inspect unresolved review threads, modified paths, line numbers, and comment node IDs:

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

### 2. Match and resolve threads

Compare the unresolved thread paths and lines against the commits pushed in the current push:

1. **Valid defect addressed:**
   Post a reply comment citing the pushed commit SHA and resolve the review thread via GraphQL:
   ```bash
   gh api repos/{owner}/{repo}/pulls/<pr_number>/comments/<comment_id>/replies -f body="Addressed in <commit_sha>"
   gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread_node_id>"}) { clientMutationId } }'
   ```
2. **False positive or out-of-diff suggestion:**
   If a comment suggests changes outside the active ticket boundary or contradicts repository architecture, post a technical explanation in a reply comment and resolve the thread via GraphQL:
   ```bash
   gh api repos/{owner}/{repo}/pulls/<pr_number>/comments/<comment_id>/replies -f body="Declined: <technical explanation citing coding standards or ticket scope>"
   gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread_node_id>"}) { clientMutationId } }'
   ```
3. **Ambiguous or high-risk finding:**
   Leave the thread open, explain the trade-off in a reply comment, and request maintainer review.
