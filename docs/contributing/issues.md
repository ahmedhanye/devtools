# Issue tracking and management

Guidelines for GitHub Issues, Spec and Ticket hierarchy, project status tracking, and linked branch workflows.

## Issue CLI commands

Issues and specs live as GitHub issues. Use the `gh` CLI for operations; the repository target is inferred from `git remote -v`.

GitHub shares one number space across issues and pull requests. When inspecting a reference, resolve the number with `gh pr view <number>` first, then fall back to `gh issue view <number>`.

- **Create an issue:** `gh issue create --title "<title>" --body "..."`
- **Create a Spec issue:** `gh issue create --title "<title>" --label "type:spec" --milestone "<milestone>" --body "..."`
- **Create a Ticket issue:** `gh issue create --title "<title>" --label "type:feat" --body "..."`
- **Search issues by title:** `gh issue list --search "<title>" --json number --jq '.[0].number'`
- **Read an issue:** `gh issue view <number> --json number,title,body,labels,state,comments`
- **List open issues:** `gh issue list --state open --json number,title,body,labels,comments`
- **Comment on an issue:** `gh issue comment <number> --body "..."`
- **Edit labels:** `gh issue edit <number> --add-label "..."` or `--remove-label "..."`

## Hierarchy and dependencies

The project organizes work into Specs and Tickets:

- **Specs** track milestone capabilities.
- **Tickets** deliver vertical slices that can stand alone or link to a parent Spec as sub-issues.

### Query and link hierarchy

- **Inspect sub-issues:** Query existing sub-issues for a parent issue:
  ```bash
  gh api --paginate repos/{owner}/{repo}/issues/<number>/sub_issues --jq '.[] | {number: .number, title: .title, state: .state}'
  ```
- **Attach ticket to parent Spec:** Link a child ticket:
  ```bash
  gh api --method POST repos/{owner}/{repo}/issues/<spec_number>/sub_issues \
    -F sub_issue_id=<ticket_db_id>
  ```
  Use capital `-F` to pass the database ID as an integer.
- **Add dependency:** Declare a blocking relationship:
  ```bash
  gh api --method POST repos/{owner}/{repo}/issues/<ticket_number>/dependencies/blocked_by \
    -F issue_id=<blocker_db_id>
  ```
- **Resolve database ID:** Look up numeric database ID:
  ```bash
  gh api repos/{owner}/{repo}/issues/<number> --jq .id
  ```
- **Resolve parent Spec:** Look up the parent Spec number for a ticket:
  ```bash
  gh api repos/{owner}/{repo}/issues/<ticket_number>/parent --jq .number 2>/dev/null
  ```
- **Single source of truth:** Omit manual parent links, child checklists, and `Blocked by: #...` lines from markdown bodies when native issue hierarchy and dependencies are enabled.
- **Milestones:** Assigned strictly to Specs to track deliverables. Tickets do not receive milestones. Query active milestone titles:
  ```bash
  gh api --paginate repos/{owner}/{repo}/milestones --jq '.[].title'
  ```
- **List available unassigned tickets:**
  ```bash
  gh issue list --state open --assignee "" --label "type:feat"
  ```

## Project board status lifecycle

Status is tracked on GitHub Project boards (`Todo`, `In Progress`, `In Review`, `Done`). `Done` transitions are handled automatically on PR merge via `Closes #<issue>`. Repository `status:*` labels are not used.

Ensure the token has the `project` scope before running project commands:

```bash
gh auth refresh -s project
```

To update status on a project board:

```bash
ITEM_ID=$(gh project item-add <project_number> --owner <owner> --url "https://github.com/<owner>/<repo>/issues/<issue_number>" --format json --jq .id 2>/dev/null || true)
if [ -n "$ITEM_ID" ]; then
  gh project item-edit --id "$ITEM_ID" --project-id "<project_id>" --field-id "<status_field_id>" --single-select-option-id "<option_id>"
fi
```

### Claiming a ticket and branch checkout

Before branching:

1. Verify a clean working tree:
   ```bash
   git status --porcelain
   ```
2. Update local `main`:
   ```bash
   git checkout main && git pull origin main
   ```
3. Assign `@me`, create the linked branch, and transition status to `In Progress`:
   ```bash
   gh issue edit <ticket_number> --add-assignee @me
   gh issue develop <ticket_number> --checkout
   ```
   If using project board tracking:
   ```bash
   ITEM_ID=$(gh project item-add <project_number> --owner <owner> --url "https://github.com/<owner>/<repo>/issues/<ticket_number>" --format json --jq .id 2>/dev/null || true)
   if [ -n "$ITEM_ID" ]; then
     gh project item-edit --id "$ITEM_ID" --project-id "<project_id>" --field-id "<status_field_id>" --single-select-option-id "<in_progress_option_id>"
   fi
   ```

If the linked branch was already created, list linked branches and check out the branch by name:

```bash
gh issue develop <ticket_number> --list
git checkout <branch_name>
```

### Parent spec synchronization

When any child ticket moves to `In Progress`, update the parent Spec to `In Progress` on the project board:

```bash
if PARENT_RESP=$(gh api repos/{owner}/{repo}/issues/<ticket_number>/parent 2>&1); then
  PARENT_NUM=$(echo "$PARENT_RESP" | jq -r .number)
  PARENT_ITEM_ID=$(gh project item-add <project_number> --owner <owner> --url "https://github.com/<owner>/<repo>/issues/${PARENT_NUM}" --format json --jq .id 2>/dev/null || true)
  if [ -n "$PARENT_ITEM_ID" ]; then
    gh project item-edit --id "$PARENT_ITEM_ID" --project-id "<project_id>" --field-id "<status_field_id>" --single-select-option-id "<in_progress_option_id>"
  fi
fi
```

Parent Specs remain `In Progress` until all child tickets reach `Done` and the maintainer reviews the Spec.

## Issue tracking conventions

- **Clean title conventions**: Issue titles must not include bracketed prefixes (such as `[Spec]:`, `[Slice]:`, `[Bug]:`). Issue type and scope are tracked exclusively through GitHub labels (`type:spec`, `type:feat`, `type:bug`).
- Tickets serve as immutable behavioral contracts once created. Requirements, failure modes, and acceptance criteria text must not be altered after work begins.
- Updating checklist status: When task lists exist in ticket or parent Spec descriptions, contributors and agents should check off completed items (`- [ ]` to `- [x]`) using `gh issue edit <number> --body "$UPDATED_BODY"` as vertical slices and criteria are verified. Do not reword or delete the criteria text itself.
- Post technical discoveries, blocker updates, and operational decisions as issue comments rather than editing original ticket requirements.
- Closing tickets is handled automatically when the linked pull request merges into `main`. Do not close tickets manually prior to merge.
