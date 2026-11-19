# Single pull requests

Workflow for opening and squash-merging a single pull request when the changeset fits under 5,000 lines of code and 80 files within one vertical slice. For shared title, template, label, evidence, and checklist rules, see [Pull requests](../pull-request.md).

## Open a single pull request

Write the PR description matching [`.github/PULL_REQUEST_TEMPLATE.md`](../../../.github/PULL_REQUEST_TEMPLATE.md) to a file, push the branch if it is not yet on `origin`, and pass `--title` and `--body-file` (avoid `--fill`, which bypasses the template):

```bash
git push -u origin "$(git branch --show-current)"
gh pr create \
  --assignee "@me" \
  --label "<area-label>" \
  --label "<type-label>" \
  --title "<pr-title>" \
  --body-file <pr_body_file>
```

If tracking the ticket on the GitHub Project board, move it to `In Review` per [Project board status lifecycle](../issues.md#project-board-status-lifecycle).

## Merge a single pull request

Linear history with squash merging is enforced by repository rulesets. Once `CODEOWNERS` approves, reviewers resolve all review threads, and all required status checks pass, squash merge with an empty commit body so `main` records only the PR title and linked PR number (`#NNN`). Mark breaking runtime changes with `!:` in the PR title (for example, `feat(cli)!: ...`) so Release Please triggers a major bump cleanly:

```bash
gh pr merge <pr_number> --squash --body "" --delete-branch
```

> [!WARNING]
> Never use `gh pr merge` on stacked pull requests. Merge stacks exclusively through `gh stack merge` per [Stacked pull requests](stacked-prs.md#5-merging-and-cleanup).
