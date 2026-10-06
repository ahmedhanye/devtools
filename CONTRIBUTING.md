# Contributing to DevTools

## Development workflow

Development follows an issue-first, vertical slice workflow:

1. Every change begins with an issue. Do not open a pull request without a tracking issue.
2. One ticket, one vertical slice. Deliver end-to-end functionality across schema, logic, UI, and tests in a single session.
3. No direct pushes to `main`. All code lands through reviewed pull requests.

## Branching

Create linked branches directly from issues:

```bash
gh issue develop <ticket_number> --checkout
```

This creates and checks out `<ticket_number>-<title-slug>` and links it to the issue in GitHub.

## Commits and pull requests

### Commit format

Follow Conventional Commits:

```text
<type>(<scope>): <imperative description>
```

Do not include issue references (e.g. `(#123)`) in commit subjects. Issue tracking and closing are handled at the Pull Request level to keep commit histories clean and avoid issue timeline clutter.

Examples:

- `feat(server): add initial health check endpoint`
- `fix(web): resolve layout shift on mobile viewports`
- `chore(ci): update workflow dependencies`

### Pull request rules

1. Link the tracking issue: `gh issue develop` links the issue automatically. If created manually, add `Closes #<issue>` to the pull request body.
2. Follow the pull request structure: PR descriptions must follow `.github/PULL_REQUEST_TEMPLATE.md` (Summary with structural diff/tree, Evidence, and Merge Danger). Do not list commit subjects, branch mechanics, or CLI commands.
3. Provide verification evidence: include terminal test output, commands, or observable behavior.
4. Open the pull request and update status: run `gh pr create`, then update the tracking issue to `In Review` on the project board via `gh project item-edit`.
5. Squash merge into `main` after review passes: `gh pr merge <pr_number> --squash --delete-branch`.

## Contributor boundaries

Contributors and agents observe these boundaries:

1. Issue operations: follow `.agents/docs/issue-tracker.md` for ticket claiming, dependency management, and project board status updates.
2. Issue updates:
   - Check off completed acceptance criteria (`- [x]`).
   - Post technical discoveries and blocker alerts as issue comments.
   - Do not delete issues, alter problem statements, or drop acceptance criteria.
3. Escalation: when requirements are ambiguous or tests fail repeatedly, apply `needs-human-review`, post a blocker summary, and yield execution.
