# Issue tracking and management

Conventions for creating, linking, and updating GitHub Specs and Tickets in this repository.

## Specs vs. Tickets

Work splits into two issue kinds in [`.github/ISSUE_TEMPLATE/`](../../.github/ISSUE_TEMPLATE/):

| Kind       | Template                                                | Native Type                                | Labels                       | Milestone                        | Role                                                                                       |
| :--------- | :------------------------------------------------------ | :----------------------------------------- | :--------------------------- | :------------------------------- | :----------------------------------------------------------------------------------------- |
| **Spec**   | [`spec.yml`](../../.github/ISSUE_TEMPLATE/spec.yml)     | `Feature`                                  | `type:spec`                  | Active milestone when applicable | Tracks a capability or multi-slice effort and owns child sub-issues                        |
| **Ticket** | [`ticket.yml`](../../.github/ISSUE_TEMPLATE/ticket.yml) | `Task` (`Bug` / `Feature` when overridden) | Matching `type:*` & `area:*` | None                             | Delivers one actionable slice (`feat`, `bug`, `docs`, `infra`, `research`, or `Task` work) |

Repository areas group under five labels: `area:backend` (`api`, `core`, `db`, `browser`, `lighthouse`), `area:cli` (`cli`), `area:frontend` (`frontend`), `area:docs` (`docs` and `site`), and `area:tooling` (`.github`, `scripts`, `.agents`). Check live labels (`gh label list`) and milestones (`gh api --paginate repos/{owner}/{repo}/milestones --jq '.[].title'`) rather than guessing names. For interactive drafting workflows, use `/to-spec` for multi-slice Specs and `/to-tickets` for splitting a Spec into dependent child Tickets.

## Issue bodies and titles

- **Clean titles.** Omit bracketed prefixes (`[Spec]:`, `[Ticket]:`, `[Slice]:`, `[Bug]:`) and Conventional Commit prefixes (`feat(...):`, `fix(...):`, `chore(...):`). Track kind, type, and area through GitHub Issue Types and labels.
- **Matching sections.** Mirror [`spec.yml`](../../.github/ISSUE_TEMPLATE/spec.yml) (`Overview and problem`, `Expected outcome and acceptance criteria`, optional `Scope and boundaries`) or [`ticket.yml`](../../.github/ISSUE_TEMPLATE/ticket.yml) (`Problem`, `Expected outcome`, `Acceptance criteria`).
- **Problem and outcome only.** Describe the problem and observable expected behavior across public interfaces. Leave out internal file paths, helper names, implementation steps, and standards already documented in [`CODING_STANDARDS.md`](../../CODING_STANDARDS.md) or [`TESTING.md`](../../TESTING.md). Cite a CLI flag, route, or status code only when that external interface is part of the contract.
- **Native hierarchy.** Use GitHub Sub-Issues and native `blocked_by` dependencies instead of duplicating parent links, child lists, or `Blocked by: #...` lines in markdown bodies.

## GitHub CLI and API reference

Because issues and pull requests share one number space on GitHub, resolve an unknown reference with `gh pr view <n> --json number,title` before `gh issue view <n> --json number,title`, and pass `--json` on queries to avoid deprecated project lookups.

| Action                              | Command                                                                                                                                             |
| :---------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a Spec                       | `gh issue create --title "<title>" --label "type:spec" [--milestone "<milestone>"] --body "..."`                                                    |
| Create a Ticket                     | `gh issue create --title "<title>" --label "<type-label>" --body "..."`                                                                             |
| Set native Issue Type (`gh 2.46.0`) | `gh api --method PATCH repos/{owner}/{repo}/issues/<number> -f type="<Feature\|Task\|Bug>"`                                                         |
| List open unassigned tickets        | `gh issue list --state open --assignee "" --json number,title,labels`                                                                               |
| Resolve database ID                 | `gh api repos/{owner}/{repo}/issues/<number> --jq .id`                                                                                              |
| Link child Ticket to parent Spec    | `gh api --method POST repos/{owner}/{repo}/issues/<spec_number>/sub_issues -F sub_issue_id=<ticket_db_id>`                                          |
| Add blocking dependency             | `gh api --method POST repos/{owner}/{repo}/issues/<ticket_number>/dependencies/blocked_by -F issue_id=<blocker_db_id>`                              |
| Query blocking dependencies         | `gh api --paginate repos/{owner}/{repo}/issues/<ticket_number>/dependencies/blocked_by --jq '[.[] \| select(.state == "open") \| {number, title}]'` |
| Query child sub-issues              | `gh api --paginate repos/{owner}/{repo}/issues/<spec_number>/sub_issues --jq '.[] \| {number, title, state}'`                                       |
| Query parent Spec                   | `gh api repos/{owner}/{repo}/issues/<ticket_number>/parent 2>/dev/null \| jq -r '.number // empty'`                                                 |

## Branching, updates, and closing

1. **Claim a ticket.** Start from a clean tree on up-to-date `main`, assign `@me`, and check out the linked branch:
   ```bash
   gh issue edit <ticket_number> --add-assignee @me
   gh issue develop <ticket_number> --base main --checkout
   ```
   If a linked branch already exists, list full branch names without PTY truncation (`gh issue develop <ticket_number> --list | cut -f1`), then run `git fetch origin <branch> && git checkout <branch>`.
2. **Keep requirements stable.** Post technical discoveries, blocker updates, and scope decisions as issue comments rather than rewriting ticket requirements. When criteria pass, toggle `- [ ]` to `- [x]` via `gh issue edit <number> --body "$UPDATED_BODY"`.
3. **Auto-close via PR.** Include `Closes #<ticket_number>` in the pull request description so merging closes the ticket automatically. Leave any parent Spec open until all child tickets finish.

## Project board status lifecycle

Project `#8` (`DevTools`) uses `PVT_kwHOBtOqTs4BlBUk` with status field `PVTSSF_lAHOBtOqTs4BlBUkzhjvvg4`:

| Status        | Option ID  |
| :------------ | :--------- |
| `Todo`        | `2ed95dcd` |
| `In Progress` | `47fc9ee4` |
| `In Review`   | `27903ead` |
| `Done`        | `98236657` |

Add or update an issue status when `project` scope is available (skip rather than blocking if the active token lacks `project` scope):

```bash
ITEM_ID=$(gh project item-add 8 --owner AhmedHanye --url "https://github.com/AhmedHanye/devtools/issues/<number>" --format json --jq .id 2>/dev/null || true)
if [ -n "$ITEM_ID" ]; then
  gh project item-edit --id "$ITEM_ID" --project-id "PVT_kwHOBtOqTs4BlBUk" --field-id "PVTSSF_lAHOBtOqTs4BlBUkzhjvvg4" --single-select-option-id "<option_id>"
fi
```

When starting a child ticket, set both the ticket and any parent Spec to `In Progress`.
