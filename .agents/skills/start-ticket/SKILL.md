---
name: start-ticket
description: Claim a ticket, prepare its linked branch from main, and update status following repository conventions. Use when starting work on a ticket or issue.
---

Read `CONTRIBUTING.md` and its linked issue guide in full. In parallel, inspect working tree status, the target issue's state, details, and blockers, any existing linked branches, and its parent Spec if any. Once the working tree is clean and the issue is open and unblocked, update `main`, check out an existing linked branch or create a new one from `main`, assign the issue to `@me`, and set the ticket and any parent Spec to `In Progress` directly according to those rules without asking for confirmation.

Never discard, stash, or revert uncommitted changes to clean the tree; stop and report if the working tree is dirty, the issue is missing, closed, or blocked, or any branch or tracker update fails.
