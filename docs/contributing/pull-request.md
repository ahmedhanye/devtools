# Pull requests

Shared rules for triaging, titling, describing, labeling, and verifying every pull request, plus routing to single-PR and stacked-PR workflows.

## Choose a PR workflow

| Guide                                                | Read when                                                                                |
| :--------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| [Single pull requests](pull-request/single-pr.md)    | Changeset stays under **5,000 LOC** and **80 files** within one vertical slice.          |
| [Stacked pull requests](pull-request/stacked-prs.md) | Changeset exceeds **5,000 LOC** or **80 files**, or spans multiple architectural layers. |

For replying to open review threads after pushing fixes, see [Pull request comments](pull-request/comments.md) (primarily paired with [Pushing changes](push.md)).

## Triage and GitHub CLI notes

External pull requests are not treated as feature requests; new capabilities begin as tracking issues.

- **Read a PR.** `gh pr view <number> --json number,title,body,labels,comments` and `gh pr diff <number>`.
- **List open PRs.** `gh pr list --state open --json number,title,body,labels,author,comments`.
- **File-filtered PR diffs.** `gh pr diff <number>` does not take path arguments; use `git diff origin/main...HEAD -- <path>`.
- **Check-run polling.** `gh pr checks <number>` exits `8` while checks are pending; pass `--watch` to await completion.

> [!NOTE]
> On `gh 2.46.0`, bare `gh pr view <number>` and `gh pr edit <number>` fail on deprecated `projectCards` GraphQL queries. Pass explicit `--json` fields to inspect PRs and use REST `gh api --method PATCH` to update titles, bodies, labels, or assignees.

## Shared pull request rules

1. **Link the tracking issue.** `gh issue develop` links branches automatically. Include `Closes #<issue>` in the PR body (or `Part of #<issue>` on intermediate layers of a stacked PR, reserving `Closes #<issue>` for the final top layer).
2. **Assign and label.** Assign yourself (`@me`) and attach matching `area:*` (`area:backend`, `area:cli`, `area:frontend`, `area:docs`, `area:tooling`) and `type:*` labels (`CODEOWNERS` requests maintainer review automatically).
3. **Follow the PR template.** Match [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md) (Summary with structural diff, Evidence, Merge Danger). Cite permanent repository-relative paths only, omitting temporary local paths or raw debug logs.
4. **Conventional Commit PR titles.** Because squash merging commits only the PR title with an empty body on `main`, Release Please evaluates the PR title directly per [Commits and atomic changes](commits.md):
   - **Deterministic CI + semantic AI review.** [`.github/workflows/pr-title.yml`](../../.github/workflows/pr-title.yml) enforces syntax, allowed types, clean optional scope syntax, no `#123` issue references, and length (**65 characters or fewer**; **64** at PR `#1000+` so GitHub's ` (#NNN)` fits in 72 characters). CodeRabbit checks that the type, scope, and summary logically match the delivered diff and use canonical workspace scopes without synonym drift.
   - **Primary deliverable scope.** Name the title after the primary delivered area using canonical workspace names (`api`, `cli`, `frontend`, `browser`, `core`, `db`, `lighthouse`, `site`, `deps`) or a clear sub-scope (`cli/audit`). Omit the scope for cross-cutting or root work (`feat: ...`, `ci: ...`, `docs: ...`, `chore: ...`). Never use `(repo)` or comma-separated scopes.
   - **Release safety and breaking changes.** Reserve `feat` for end-user runtime capabilities (minor bump), `fix` for runtime bug fixes or security dependency patches (`fix(deps)`, patch bump), `perf`/`revert` for runtime performance or reverts (patch bump), and `ci:` for CI/workflow changes. Never use release-triggering types on non-runtime areas (`site`, `docs`, `agents`, `scripts`, `ci`). Mark breaking runtime changes with `!:` in the title (for example, `feat(cli)!: ...`) so Release Please bumps major without needing a squash body.
5. **Verification evidence mapped to issue criteria.** In `## Evidence`, verify every acceptance criterion from the linked issue with observable output:
   - Include path-scoped completion check output from [`REVIEW.md`](../../REVIEW.md#scope-and-verification-matrix), including `bun run test:coverage <workspace>` and `bun run verify:diff-coverage` for code changes.
   - When touching CLI commands or terminal formatters, include cold-start timing (`< 100ms`), `NO_COLOR=1`, and non-TTY `stdout`/`stderr` separation proof.
6. **Sync issue checklists and project status.** Before opening the PR, inspect the linked ticket (`gh issue view <ticket_number> --json number,title,body,state,labels`) and parent Spec (`gh api repos/{owner}/{repo}/issues/<ticket_number>/parent --jq .number 2>/dev/null`), toggle completed `- [ ]` checkboxes to `- [x]` via `gh issue edit`, and move the item to `In Review` per [Project board status lifecycle](issues.md#project-board-status-lifecycle).
