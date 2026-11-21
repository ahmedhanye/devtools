# Pushing changes and review synchronization

Guidelines for verifying branch readiness, pushing commits, inspecting active pull requests, and replying to review comments after pushing.

## Pre-push quality gate

Before pushing to `origin`, run the completion check matching your changed paths in [Review and verification guide](../../REVIEW.md#scope-and-verification-matrix) (or `bun run verify` for root or multi-workspace changes; pass `BASE_REF="<parent-layer-branch>"` on stacked PR branches).

`lefthook.yml` also runs a parallel `pre-push` hook executing whole-repo `typecheck`, `fallow:dead-code`, `fallow:arch`, `fallow:health`, and `fallow:dupes` automatically on every `git push`.

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

When the branch has an open pull request and the pushed commits address comments on that pull request, reply to each addressed comment right after pushing (never before pushing, so the remote diff shows the updated code) following [Reply to a review comment](pull-request/comments.md#2-reply-to-a-review-comment).

For querying open threads before replying, see [Pull request comments](pull-request/comments.md).
