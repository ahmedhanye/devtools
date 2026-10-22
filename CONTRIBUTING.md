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
- **Create a Spec issue**: `gh issue create --title "[Spec]: <title>" --label "type:spec" --milestone "<milestone>" --body "..."`
- **Create a Ticket issue**: `gh issue create --title "[Slice]: <title>" --label "type:feat" --body "..."`
- **Search issues by title**: `gh issue list --search "<title>" --json number --jq '.[0].number'`
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,state,comments` (always specify `--json` to avoid deprecated GraphQL queries).
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Edit labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

### Hierarchy and dependencies

The project organizes work into Specs and Tickets. Specs track milestone capabilities, and Tickets deliver atomic vertical slices that can stand alone or link to a parent Spec as sub-issues.

- **Inspect sub-issues.** Query existing sub-issues for a parent issue:
  ```bash
  gh api --paginate repos/{owner}/{repo}/issues/<number>/sub_issues --jq '.[] | {number: .number, title: .title, state: .state}'
  ```
- **Attach ticket to parent Spec.** Link a child ticket:
  ```bash
  gh api --method POST repos/{owner}/{repo}/issues/<spec_number>/sub_issues \
    -F sub_issue_id=<ticket_db_id>
  ```
  Use capital `-F` to pass the database ID as a typed integer. Lowercase `-f` passes a string value and fails with `422 Unprocessable Entity`.
- **Add dependency.** Declare a blocking relationship:
  ```bash
  gh api --method POST repos/{owner}/{repo}/issues/<ticket_number>/dependencies/blocked_by \
    -F issue_id=<blocker_db_id>
  ```
- **Resolve database ID.** Look up numeric database ID:
  ```bash
  gh api repos/{owner}/{repo}/issues/<number> --jq .id
  ```
- **Resolve parent Spec.** Look up the parent Spec number for a ticket:
  ```bash
  gh api repos/{owner}/{repo}/issues/<ticket_number>/parent --jq .number 2>/dev/null
  ```
- **Single source of truth.** Omit manual parent links, child checklists, and `Blocked by: #...` lines from markdown bodies when native issue hierarchy and dependencies are enabled.
- **Milestones.** Assigned strictly to Specs to track milestone deliverables without metric dilution. Tickets do not receive milestones. Query active milestone titles:
  ```bash
  gh api --paginate repos/{owner}/{repo}/milestones --jq '.[].title'
  ```
- **Query frontier.** List open tickets with zero unresolved blockers and no DRI.

### Project board status lifecycle

Status is tracked on GitHub Project #8 (`Todo`, `In Progress`, `In Review`, `Done`). `Done` transitions are handled automatically on PR merge. Repository `status:*` labels are not used.

Project #8 identifiers:

- Owner: `AhmedHanye`
- Project ID: `PVT_kwHOBtOqTs4BlBUk`
- Status Field ID: `PVTSSF_lAHOBtOqTs4BlBUkzhjvvg4`
- Status Option IDs: `Todo` (`2ed95dcd`), `In Progress` (`47fc9ee4`), `In Review` (`27903ead`), `Done` (`98236657`)

Ensure the token has the `project` scope before running project commands. Run `gh auth refresh -s project` if the scope is missing.

To update status on Project #8:

```bash
ITEM_ID=$(gh project item-add 8 --owner AhmedHanye --url "https://github.com/AhmedHanye/devtools/issues/<issue_number>" --format json --jq .id)
gh project item-edit --id "$ITEM_ID" --project-id "PVT_kwHOBtOqTs4BlBUk" --field-id "PVTSSF_lAHOBtOqTs4BlBUkzhjvvg4" --single-select-option-id "<option_id>"
```

- **Claim ticket.** Assign `@me`, create the native linked branch, and transition the ticket to `In Progress` in GitHub Project #8:
  ```bash
  gh issue edit <ticket_number> --add-assignee @me
  gh issue develop <ticket_number> --checkout
  ITEM_ID=$(gh project item-add 8 --owner AhmedHanye --url "https://github.com/AhmedHanye/devtools/issues/<ticket_number>" --format json --jq .id)
  gh project item-edit --id "$ITEM_ID" --project-id "PVT_kwHOBtOqTs4BlBUk" --field-id "PVTSSF_lAHOBtOqTs4BlBUkzhjvvg4" --single-select-option-id "47fc9ee4"
  ```
- **Parent Spec rollup.**
  - When any child ticket moves to `In Progress`, update the parent Spec to `In Progress` on the project board:
    ```bash
    PARENT_RESP=$(gh api repos/{owner}/{repo}/issues/<ticket_number>/parent 2>&1) || PARENT_STATUS=$?
    if [ -z "${PARENT_STATUS:-}" ]; then
      PARENT_NUM=$(echo "$PARENT_RESP" | jq -r .number)
      PARENT_ITEM_ID=$(gh project item-add 8 --owner AhmedHanye --url "https://github.com/AhmedHanye/devtools/issues/${PARENT_NUM}" --format json --jq .id)
      gh project item-edit --id "$PARENT_ITEM_ID" --project-id "PVT_kwHOBtOqTs4BlBUk" --field-id "PVTSSF_lAHOBtOqTs4BlBUkzhjvvg4" --single-select-option-id "47fc9ee4"
    elif echo "$PARENT_RESP" | grep -q "No parent issue found"; then
      : # Standalone ticket without parent Spec
    else
      echo "Failed to query parent issue: $PARENT_RESP" >&2
      return 1 2>/dev/null || exit 1
    fi
    ```
  - Parent Specs never move to `In Review` automatically from child tickets.
  - Parent Specs remain `In Progress` until all child tickets reach `Done` and the maintainer reviews the Spec.
- **Resolve ticket.** Post the solution summary in a comment and close the ticket:
  ```bash
  gh issue comment <ticket_number> --body "..."
  gh issue close <ticket_number>
  ```

### Issue hygiene

- Check off completed acceptance criteria (`- [x]`) as implementation progresses and when opening pull requests.
- Post technical discoveries and blocker alerts as issue comments.
- Keep issue descriptions updated: mark completed checklist items and revise outdated instructions or command references when scope evolves, while preserving the original problem statement and core acceptance criteria definitions.

## Branching

### Clean workspace and branch synchronization

Before branching or starting work on an issue:

1. Verify a clean working tree:
   ```bash
   git status --porcelain
   ```
2. Update local `main`:
   ```bash
   git checkout main && git pull origin main
   ```

### Linked branch checkout

Create and check out a linked branch directly from an issue:

```bash
gh issue develop <ticket_number> --checkout
```

This creates and checks out `<ticket_number>-<title-slug>` and links it to the issue in GitHub.

If the branch was already created, list linked branches or check out the existing local branch:

```bash
gh issue develop <ticket_number> --list
git checkout "$(git branch --list "<ticket_number>-*" | head -n 1 | sed 's/^[* ]*//')"
```

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
2. **Self-assign the pull request:** Always self-assign as the Directly Responsible Individual (DRI) when opening a pull request by passing `--assignee "@me"` (maintainer review is automatically requested via CODEOWNERS).
3. **Follow the pull request structure:** PR descriptions must describe user-facing changes to `main` following `.github/PULL_REQUEST_TEMPLATE.md` (Summary with structural diff/tree, Evidence, and Merge Danger). Pull request descriptions cite permanent codebase paths and omit ephemeral workspace `.scratch/` paths, raw session logs, and agent execution notes.
4. **Provide verification evidence:** Include terminal test output, commands, or observable behavior confirming all acceptance criteria.
5. **Audit tracking issue checklist and instructions:** Before opening the pull request, inspect the linked issue/ticket description (`gh issue view <ticket_number>`). Check off all completed acceptance criteria (`- [x]`) and update any outdated instructions, commands, or scope definitions that evolved during implementation.
6. **Open the pull request and update status.** Create the pull request, then transition the tracking issue to `In Review` in GitHub Project #8:
   ```bash
   gh pr create --assignee "@me"
   ITEM_ID=$(gh project item-add 8 --owner AhmedHanye --url "https://github.com/AhmedHanye/devtools/issues/<ticket_number>" --format json --jq .id)
   gh project item-edit --id "$ITEM_ID" --project-id "PVT_kwHOBtOqTs4BlBUk" --field-id "PVTSSF_lAHOBtOqTs4BlBUkzhjvvg4" --single-select-option-id "27903ead"
   ```
7. **Review thread resolution:** Repository ruleset `#24154563` (`Protect Main Branch`) enforces `required_review_thread_resolution: true`. All comment threads opened by reviewers or automated review bots (such as CodeRabbit) must be addressed before merge eligibility:
   - _Valid defect:_ Implement the code fix, confirm test passes, post a comment referencing the fix commit, and resolve the thread via GitHub GraphQL:
     ```bash
     gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread_node_id>"}) { clientMutationId } }'
     ```
   - _False positive / Hallucination:_ Post a technical comment detailing why the remark is invalid or contradicts repo design, and resolve the thread via GraphQL.
   - _Ambiguous or high-risk finding:_ Leave the thread unresolved, apply the `needs-human-review` label, and escalate.
8. **Squash merge into `main` after review passes:** `gh pr merge <pr_number> --squash --delete-branch`. Linear history with squash merging is enforced by repository rulesets.

## Code style and pre-commit hooks

### Code style and autofix

- Format code: `bun run format`
- Fix lint errors: `bun run lint:fix`

### Pre-commit hooks

[Lefthook](https://github.com/evilmartians/lefthook) runs fast, offline pre-commit hooks on staged files (`oxlint`, `prettier`, `react-doctor`, and staged secret scanning). The local pre-push verification hook has been removed; comprehensive verification (`bun run verify`) runs asynchronously on pull requests in CI and remains available for on-demand local execution. Run git hooks on every commit; bypass hooks (`--no-verify`) strictly during maintainer-approved emergencies.

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
