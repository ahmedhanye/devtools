# Pushing changes and review synchronization

Guidelines for verifying branch readiness, executing remote pushes, correlating pull requests, and replying to review comments after pushing.

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

## Post-push review comment replies

Reply to open review comments only **after** the corresponding code fix has been committed and successfully pushed to GitHub so the remote pull request diff displays the updated code. Leave thread resolution to the human or AI reviewer.

Follow the inspection, investigation, and reply actions in [Pull request comments](pr-comments.md).
