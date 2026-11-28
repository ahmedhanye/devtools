---
name: clean-up-branches
description: Audit and clean up merged or unneeded local and remote branches with explicit confirmation.
disable-model-invocation: true
---

# Clean up branches

Read `CONTRIBUTING.md` and its linked branch guide in full first, then run the guide's read-only audit commands (`git fetch --prune`, local branches, worktrees, remote branches, and matching pull request or issue states including `headRefOid`) without deleting any branch.

Present a bulleted list of all existing local and remote branches grouped into **Safe to delete** and **Not safe to delete** (noting why each branch is protected or needs review, including any unpushed commits), and wait for the user to decide which branches to delete.

Delete only the explicitly confirmed branches per the guide, leave protected and unapproved branches untouched, and report the remaining local and remote branches.

Completion criterion: Only explicitly confirmed branches are deleted and the remaining local and remote branches are reported.
