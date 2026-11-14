---
name: commit
description: Stage and commit changes following repository conventions. Use when committing changes.
---

Read `CONTRIBUTING.md`, its linked commit guide, `REVIEW.md`, and repository hook or commitlint configs in full, inspect all staged, unstaged, and untracked changes in parallel, and commit them all directly according to those rules without asking for confirmation.

Never bypass hooks (`--no-verify`) or revert user changes to pass a check; fix formatting, staging, or commit messages automatically, and only stop on real secrets or unresolvable failures.
