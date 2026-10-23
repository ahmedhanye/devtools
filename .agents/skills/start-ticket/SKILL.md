---
name: start-ticket
description: Prepare a fresh, linked branch for an assigned issue and sync local state with main.
disable-model-invocation: true
---

# Start ticket

Prepare the workspace and branch for an issue. Follow `CONTRIBUTING.md`.

## Actions

1. Validate issue number, title, and link. Halt immediately if any detail is missing.
2. Inspect working tree (`git status --porcelain`). Halt immediately if dirty.
3. Checkout and update `main` (`git checkout main && git pull origin main`).
4. Create and checkout native linked branch (`gh issue develop <number> --checkout`).
5. Assign issue to `@me` (`gh issue edit <number> --add-assignee @me`).
6. Set ticket and parent Spec to `In Progress` following `CONTRIBUTING.md`.
