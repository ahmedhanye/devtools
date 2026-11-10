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

## Remote push execution

Execute pushes non-interactively:

- **Standard branch push:**
  ```bash
  git push origin <branch>
  ```
- **Stacked PR branches (`gh-stack`):**
  Synchronize rebased branches and PR metadata across the stack per [Stacked Pull Requests](stacked-prs.md) (use `--prune` to remove branches for merged PRs):
  ```bash
  gh stack sync
  ```

## Active pull request inspection

After pushing to the remote repository, check if an open pull request already exists for the active branch:

```bash
gh pr list --head $(git branch --show-current) --json number,title,state,url
```

If no pull request exists yet, follow [Pull requests and code review](pull-requests.md) to open one when ready.

## Post-push review thread resolution

Branch protection requires all review comment threads to be resolved before merge eligibility. Review threads must only be resolved **after** the corresponding code fix has been committed and successfully pushed to GitHub. This ensures the pull request diff on GitHub displays the updated code.

Follow the inspection, investigation, and resolution actions in [Pull request comments and thread resolution](pr-comments.md).
