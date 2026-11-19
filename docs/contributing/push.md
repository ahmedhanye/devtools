# Pushing changes and review synchronization

Guidelines for verifying branch readiness, pushing commits, inspecting active pull requests, and replying to review comments after pushing.

## Pre-push quality gate

Before pushing to `origin`, run the completion check matching your changed paths in [Review and verification guide](../../REVIEW.md#scope-and-verification-matrix) (or `bun run verify` for root or multi-workspace changes; pass `BASE_REF="<parent-layer-branch>"` on stacked PR branches).

## Remote push execution

- **Standard branch push:**
  ```bash
  git push origin <branch>
  ```
- **Stacked PR branches (`gh-stack`):**
  Fetch and push stack updates (`git fetch origin && gh stack push`), or pull trunk, rebase, push, and prune merged branches per [Stacked pull requests](pull-request/stacked-prs.md):
  ```bash
  gh stack sync --prune
  ```

## Active pull request inspection

Check whether an open pull request already exists for the current branch:

```bash
gh pr list --head $(git branch --show-current) --json number,title,state,url
```

If no pull request exists yet, open one following [Pull requests](pull-request.md).

## Post-push review comment replies

Reply to open review comments only **after** pushing the fixing commit to `origin` so the remote pull request diff displays the updated code, and leave thread resolution to the reviewer.

Follow the query, investigation, and reply steps in [Pull request comments](pull-request/comments.md).
