# Branches

Conventions for local Git setup, branch naming, and auditing or deleting stale local and remote branches.

## Local Git setup

Run these one-time Git settings in your clone:

```bash
git config fetch.prune true
git config remote.pushDefault origin
git config push.autoSetupRemote true
git config rerere.enabled true
git config rerere.autoupdate true
```

`fetch.prune` clears stale `refs/remotes/origin/*` tracking references on `git fetch` and `git pull` without deleting local branches.

## Creating and naming branches

- **Ticket branches.** Claim a ticket and check out its linked branch with `gh issue develop` per [Issue tracking and management](issues.md#branching-updates-and-closing).
- **Stacked branches.** Name stack layers `<issue>-<topic>/<layer-number>-<layer-name>` (for example, `102-audit/01-schemas-and-core`). Never create `<branch>/<layer>` while `<branch>` exists locally or on `origin`, because Git cannot store both a branch ref and a folder prefix with the same name; delete or rename the initial branch or pick a distinct prefix first.

## Auditing and cleaning up stale branches

GitHub has `deleteBranchOnMerge` enabled, so merged pull request head branches delete automatically on `origin` and open stacked pull requests retarget to the merged base. GitHub does not delete closed-without-merge pull request branches, branches without a pull request (such as pre-split `gh issue develop` branches), or protected branches.

> [!WARNING]
> Because `main` accepts squash merges only, `git branch --merged main` misses merged branches and `git branch -d` rejects them. Deleting a squash-merged local branch requires `git branch -D`, so verify pull request state and unpushed commits before deleting rather than piping `[gone]` branches directly into `-D`.

Run these read-only commands (with explicit `--json` fields for `gh` compatibility) before deleting any branch:

```bash
git fetch --prune
git for-each-ref \
  --format="%(refname:short) | %(objectname:short) | %(upstream:short) | %(upstream:track) | %(worktreepath) | %(committerdate:short)" \
  refs/heads/
gh api repos/{owner}/{repo}/branches --paginate --jq '.[].name'
gh pr list --state open --json number,headRefName,baseRefName,title
gh pr list --state all --limit 100 --json number,headRefName,headRefOid,state,mergedAt
```

Classify each non-default local and remote branch:

| Classification | Criteria                                                                                                                                                                  | Action                                                                                                                                              |
| :------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protected      | `main`, any branch checked out in the current or a linked worktree (`%(worktreepath)`), open PR heads (including active `gh-stack` layers), or `release-please--*`        | Keep.                                                                                                                                               |
| Safe to delete | Associated PR is `MERGED` and local tip matches `headRefOid` (or has no unpushed commits beyond the merged PR), including `[gone]` and no-upstream squash-merged branches | Delete after confirmation.                                                                                                                          |
| Needs review   | Unpushed local commits (`[ahead N]` or tip mismatch), closed-without-merge PR, or no PR                                                                                   | Inspect commits against `main` (`git log main..<branch>`) and check any linked issue (`gh issue view <number> --json state,title`) before deciding. |

Delete only confirmed branches:

```bash
# Delete a local branch
git branch -D <branch>

# Delete a remote branch (avoids triggering local pre-push hooks) and prune its tracking ref
gh api --method DELETE repos/{owner}/{repo}/git/refs/heads/<branch> && git fetch --prune
```

For stacked pull requests, clean up merged stack layers with `gh stack sync --prune` per [Stacked pull requests](pull-request/stacked-prs.md#5-merging-and-cleanup).

For an optional local-only shortcut on squash-merged pull request branches, install [`seachicken/gh-poi`](https://github.com/seachicken/gh-poi) (`gh extension install seachicken/gh-poi`, then run `gh poi --dry-run` and `gh poi`); it never deletes remote branches and ignores branches without pull requests.
