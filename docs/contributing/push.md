# Pushing changes and review synchronization

Guidelines for verifying branch readiness, pushing commits, inspecting active pull requests, and replying to review comments after pushing.

## Pre-push quality gate

Before pushing to `origin`, run the verification steps in [Review and verification guide](../../REVIEW.md).

`lefthook.yml` runs two sequential `pre-push` jobs automatically on every `git push`:

1. **`verify:push-secrets`** scans unpushed commits and commit messages (`trufflehog` using `.github/trufflehog-exclude.txt` when installed on `PATH`, or the built-in Bun commit-range scanner otherwise).
2. **`verify`** runs the Turborepo-cached full offline verification suite across all workspaces and `scripts/` (replaying unchanged tasks from `.turbo`).

For repository security hardening, keep GitHub native Push Protection, non-provider pattern scanning, and token validity checks enabled in repository Code Security settings. Optional on-demand GitHub CLI extensions (`gh-codeql` for local CodeQL troubleshooting and `gh-sbom` for SBOM exports) are not required by hooks or CI.

## Remote push execution

- **Standard branch push:**
  ```bash
  git push origin <branch>
  ```
- **Stacked PR branches (`gh-stack`):**
  When committing fixes on a lower stack branch, cascade-rebase upper branches first (`gh stack rebase --upstack --no-trunk`) before running `git fetch origin && gh stack push`, or pull trunk, rebase, push, and prune merged branches per [Stacked pull requests](pull-request/stacked-prs.md):
  ```bash
  gh stack rebase --upstack --no-trunk
  git fetch origin && gh stack push
  # Or, after lower layers merge:
  gh stack sync --prune
  ```
  In non-interactive shells, a diverged stack causes `gh stack sync` to print `Sync aborted` and exit `0` without pushing, so confirm the command output reports pushed branches before replying to review comments.

## Active pull request inspection

Check whether an open pull request already exists for the current branch:

```bash
gh pr list --head $(git branch --show-current) --json number,title,state,url
```

If no pull request exists yet, open one following [Pull requests](pull-request.md).

## Post-push review comment replies

When the branch has an open pull request and the pushed commits address comments on that pull request, reply to each addressed comment right after pushing (never before pushing, so the remote diff shows the updated code) following [Reply to a review comment](pull-request/comments.md#2-reply-to-a-review-comment).

For querying open threads before replying, see [Pull request comments](pull-request/comments.md).
