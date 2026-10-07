# Issue tracker: GitHub

Issues and specs live as GitHub issues. Use the `gh` CLI for all operations. The repository is inferred from `git remote -v`.

## CLI commands

- Create an issue: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- Read an issue: `gh issue view <number> --json number,title,body,labels,state,comments,subIssues`. Always specify `--json` to avoid deprecated GraphQL queries.
- List issues: `gh issue list --state open --json number,title,body,labels,comments` with `--label` and `--state` filters.
- Comment on an issue: `gh issue comment <number> --body "..."`
- Edit labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close an issue: `gh issue close <number> --comment "..."`

## Pull requests as a triage surface

External pull requests are not treated as feature requests. New features begin as issues.

When inspecting pull requests:

- Read a PR: `gh pr view <number> --json number,title,body,labels,comments` and `gh pr diff <number>` for the diff.
- List PRs: `gh pr list --state open --json number,title,body,labels,author,comments`

GitHub shares one number space across issues and PRs. Resolve a number with `gh pr view <number>` first, then fall back to `gh issue view <number>`.

## Hierarchy and dependencies

The project organizes work into Specs (parent issues) and Tickets (child sub-issues).

- Add sub-issue:
  ```bash
  gh api --method POST repos/:owner/:repo/issues/<spec_number>/sub_issues \
    -F sub_issue_id=<ticket_db_id>
  ```
- Add dependency:
  ```bash
  gh api --method POST repos/:owner/:repo/issues/<ticket_number>/dependencies/blocked_by \
    -F issue_id=<blocker_db_id>
  ```
- Resolve database ID:
  ```bash
  gh api repos/:owner/:repo/issues/<number> --jq .id
  ```
- Single source of truth: omit manual parent links, child checklists, and `Blocked by: #...` lines from markdown bodies when native sub-issues and dependencies are enabled.
- Milestones: assigned strictly to Specs to track milestone deliverables without metric dilution. Tickets do not receive milestones.
- Query frontier: list open child tickets with zero unresolved blockers and no assignee.

## Project board status lifecycle

Status is tracked exclusively on the project board (`Todo`, `In Progress`, `In Review`, `Done`). Repository `status:*` labels are not used.

- Claim ticket: assign `@me` and create the native linked branch:
  ```bash
  gh issue edit <ticket_number> --add-assignee @me
  gh issue develop <ticket_number> --checkout
  ```
- Parent Spec rollup:
  When any child ticket moves to `In Progress`, update the parent Spec to `In Progress` on the project board.
  Parent Specs never move to `In Review` automatically from child tickets.
  Parent Specs remain `In Progress` until all child tickets reach `Done` and the maintainer reviews the Spec.
- Pull requests: follow `CONTRIBUTING.md` for pull request creation (`gh pr create --assignee "@me"`), verification evidence, and review thread resolution via GraphQL.
- Resolve ticket: post the solution summary in a comment and close the ticket:
  ```bash
  gh issue comment <ticket_number> --body "..."
  gh issue close <ticket_number>
  ```
