---
name: commit
description: Stage and commit changes following repository conventions. Use when committing changes.
---

Read `CONTRIBUTING.md`, its linked commit guide (`docs/contributing/commits.md`), `REVIEW.md`, and `commitlint.config.mjs` in full, inspect all staged, unstaged, and untracked changes in parallel, and commit them sequentially as coherent logical units without asking for confirmation.

Bundle matching tests with the `feat`, `fix`, `refactor`, `perf`, or `chore` change they verify (reserve `test:` for standalone test-only work), avoid mechanical per-folder micro-commits, omit commit bodies when the header is self-explanatory (write 1 to 3 concise "why" sentences only when non-obvious), and never bypass hooks (`--no-verify`) or revert user changes to pass a check.
