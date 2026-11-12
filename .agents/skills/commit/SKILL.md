---
name: commit
description: Stage and commit changes following repository conventions. Use when committing changes.
---

Read any repository commit rules (such as `CONTRIBUTING.md`, commit guides, or hook/commitlint configs) if present, inspect all staged, unstaged, and untracked changes, and commit them all directly according to those rules without asking for confirmation.

Never bypass hooks (`--no-verify`) or revert user changes to pass a check; fix formatting, staging, or commit messages automatically, and only stop on real secrets or unresolvable failures.
