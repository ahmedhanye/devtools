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
<type>(<scope>): <imperative description> (#<issue>)
```

Examples:
- `feat(server): add initial health check endpoint (#12)`
- `fix(web): resolve layout shift on mobile viewports (#15)`
- `chore(ci): update workflow dependencies (#20)`

### Pull request rules

1. Open draft pull requests early: `gh pr create --draft`.
2. Link the tracking issue: `gh issue develop` links the issue automatically. If created manually, add `Closes #<issue>` to the pull request body.
3. Follow the pull request structure: PR descriptions must follow `.github/PULL_REQUEST_TEMPLATE.md` (Summary with structural diff/tree, Evidence, and Merge Danger). Do not list commit subjects, branch mechanics, or CLI commands.
4. Provide verification evidence: include terminal test output, commands, or observable behavior.
5. Mark ready for review when verification passes: `gh pr ready <pr_number>`.
6. Squash merge into `main` after review passes: `gh pr merge <pr_number> --squash --delete-branch`.

## Contributor boundaries

Contributors and agents observe these boundaries:

1. Issue operations: follow `.agents/docs/issue-tracker.md` for ticket claiming, dependency management, and project board status updates.
2. Issue updates:
   - Check off completed acceptance criteria (`- [x]`).
   - Post technical discoveries and blocker alerts as issue comments.
   - Do not delete issues, alter problem statements, or drop acceptance criteria.
3. Escalation: when requirements are ambiguous or tests fail repeatedly, apply `needs-human-review`, post a blocker summary, and yield execution.
