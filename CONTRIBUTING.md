# Contributing to DevTools

## Development workflow

Development follows an issue-first, vertical slice workflow:

1. Every change begins with an issue. Ensure every pull request links to an existing tracking issue.
2. One ticket, one vertical slice. Deliver end-to-end functionality across schema, logic, UI, and tests in a single session.
3. Deliver all code to `main` through reviewed pull requests.

## Issue tracking and management

Issues and specs live as GitHub issues. Use the `gh` CLI for all operations. The repository is inferred from `git remote -v`.

GitHub shares one number space across issues and pull requests. When inspecting a reference, resolve the number with `gh pr view <number>` first, then fall back to `gh issue view <number>`.

### Issue CLI commands

- **Create an issue**: `gh issue create --title "..." --body "..."` (use a heredoc for multi-line bodies).
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,state,comments,subIssues` (always specify `--json` to avoid deprecated GraphQL queries).
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Edit labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

### Hierarchy and dependencies

The project organizes work into Specs (high-level capability specifications) and Tickets (atomic vertical slice issues created using GitHub sub-issues).

- **Attach Ticket to parent Spec**:
  ```bash
  gh api --method POST repos/:owner/:repo/issues/<spec_number>/sub_issues \
    -F sub_issue_id=<ticket_db_id>
  ```
- **Add dependency**:
  ```bash
  gh api --method POST repos/:owner/:repo/issues/<ticket_number>/dependencies/blocked_by \
    -F issue_id=<blocker_db_id>
  ```
- **Resolve database ID**:
  ```bash
  gh api repos/:owner/:repo/issues/<number> --jq .id
  ```
- **Single source of truth**: Omit manual parent links, child checklists, and `Blocked by: #...` lines from markdown bodies when native issue hierarchy and dependencies are enabled.
- **Milestones**: Assigned strictly to Specs to track milestone deliverables without metric dilution. Tickets do not receive milestones.
- **Query frontier**: List open tickets with zero unresolved blockers and no DRI.

### Project board status lifecycle

Status is tracked exclusively on the project board (`Todo`, `In Progress`, `In Review`, `Done`). Repository `status:*` labels are not used.

- **Claim ticket**: Assign `@me` and create the native linked branch:
  ```bash
  gh issue edit <ticket_number> --add-assignee @me
  gh issue develop <ticket_number> --checkout
  ```
- **Parent Spec rollup**:
  - When any child ticket moves to `In Progress`, update the parent Spec to `In Progress` on the project board.
  - Parent Specs never move to `In Review` automatically from child tickets.
  - Parent Specs remain `In Progress` until all child tickets reach `Done` and the maintainer reviews the Spec.
- **Resolve ticket**: Post the solution summary in a comment and close the ticket:
  ```bash
  gh issue comment <ticket_number> --body "..."
  gh issue close <ticket_number>
  ```

### Issue hygiene

- Check off completed acceptance criteria (`- [x]`).
- Post technical discoveries and blocker alerts as issue comments.
- Preserve existing issue descriptions, problem statements, and acceptance criteria.

## Branching

Create linked branches directly from issues:

```bash
gh issue develop <ticket_number> --checkout
```

This creates and checks out `<ticket_number>-<title-slug>` and links it to the issue in GitHub.

## Commits, releases, and pull requests

### Commit format and automated releases

Follow Conventional Commits:

```text
<type>(<scope>): <imperative description>
```

Commit types drive automated release generation via Google Release Please:

- `fix:` triggers a patch release (`v0.0.X`).
- `feat:` triggers a minor release (`v0.X.0`).
- `feat!:` or `BREAKING CHANGE:` triggers a major release (`vX.0.0`).
- `chore:`, `docs:`, `test:`, `refactor:`, `style:` do not trigger automated version bumps unless accompanied by breaking changes.

Release Please automatically maintains an open Release PR (`chore(main): release vX.Y.Z`). When merged into `main`, GitHub Actions automatically:

1. Tags the release in Git.
2. Compiles standalone native binaries across target architectures (`devtools-linux-x64`, `devtools-linux-arm64`, `devtools-darwin-x64`, `devtools-darwin-arm64`).
3. Generates cryptographic SHA256 checksums (`SHA256SUMS.txt`).
4. Attaches the binaries and checksums directly to the GitHub Release.

Keep commit subjects clean by reserving issue references (for example, `Closes #123`) for pull request descriptions. This avoids issue timeline clutter and preserves clean linear commit subjects.

Examples:

- `feat(server): add initial health check endpoint`
- `fix(web): resolve layout shift on mobile viewports`
- `chore(ci): update workflow dependencies`

### Pull request triage

External pull requests are not treated as feature requests. New features begin as issues.

When inspecting pull requests:

- **Read a PR**: `gh pr view <number> --json number,title,body,labels,comments` and `gh pr diff <number>` for the diff.
- **List PRs**: `gh pr list --state open --json number,title,body,labels,author,comments`

### Pull request rules

1. **Link the tracking issue:** `gh issue develop` links the issue automatically. If created manually, add `Closes #<issue>` to the pull request body.
2. **Self-assign the pull request:** Always self-assign as the Directly Responsible Individual (DRI) when opening a pull request (maintainer review is automatically requested via CODEOWNERS):
   ```bash
   gh pr create --assignee "@me"
   ```
3. **Follow the pull request structure:** PR descriptions must describe user-facing changes to `main` following `.github/PULL_REQUEST_TEMPLATE.md` (Summary with structural diff/tree, Evidence, and Merge Danger). Pull request descriptions cite permanent codebase paths and omit ephemeral workspace `.scratch/` paths, raw session logs, and agent execution notes.
4. **Provide verification evidence:** Include terminal test output, commands, or observable behavior confirming all acceptance criteria.
5. **Open the pull request and update status:** Run `gh pr create`, then update the tracking issue to `In Review` on the project board via `gh project item-edit`.
6. **Review thread resolution:** Repository ruleset `#24154563` (`Protect Main Branch`) enforces `required_review_thread_resolution: true`. All comment threads opened by reviewers or automated review bots (such as CodeRabbit) must be addressed before merge eligibility:
   - _Valid defect:_ Implement the code fix, confirm test passes, post a comment referencing the fix commit, and resolve the thread via GitHub GraphQL:
     ```bash
     gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread_node_id>"}) { clientMutationId } }'
     ```
   - _False positive / Hallucination:_ Post a technical comment detailing why the remark is invalid or contradicts repo design, and resolve the thread via GraphQL.
   - _Ambiguous or high-risk finding:_ Leave the thread unresolved, apply the `needs-human-review` label, and escalate.
7. **Squash merge into `main` after review passes:** `gh pr merge <pr_number> --squash --delete-branch`. Linear history with squash merging is enforced by repository rulesets.

## Code style and pre-commit hooks

### Code style and autofix

- Format code: `bun run format`
- Fix lint errors: `bun run lint:fix`

### Pre-commit hooks

[Lefthook](https://github.com/evilmartians/lefthook) runs fast pre-commit hooks on staged files. Run git hooks on every commit; bypass hooks (`--no-verify`) strictly during maintainer-approved emergencies.

## Supply chain security and contributor boundaries

Contributors and automated agents observe these security and contribution boundaries:

1. **Frozen lockfile enforcement:**
   Always install dependencies using `bun install --frozen-lockfile`. Unintended modifications to `bun.lock` fail CI immediately. Adding or updating dependencies requires explicit rationale and intentional lockfile commits.

2. **Zero phantom dependencies:**
   Every package imported in a workspace (`apps/*`, `packages/*`) must be explicitly declared in that workspace's local `package.json`. Undeclared dependencies fail Fallow architectural boundary analysis.

3. **Fork security boundary:**
   Protected workflows (`.github/workflows/`), agent configurations (`.agents/`), and toolchain configurations (`bunfig.toml`, `lefthook.yml`, `package.json`) are guarded by GitHub Branch Rulesets and mandatory Code Owner review (`@AhmedHanye`). External pull requests modifying these protected boundaries cannot be merged without explicit maintainer approval.

4. **Escalation:**
   When requirements are ambiguous or tests fail repeatedly, apply `needs-human-review`, post a blocker summary, and yield execution to the maintainer.
