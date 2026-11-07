---
name: pr
description: Create, update, or stack pull requests following repository templates, title conventions, and gh-stack workflows. Use when opening a PR, writing or editing a PR body, splitting large changes (>5,000 LOC or multi-layer) into stacked PRs, or running gh stack commands.
---

# Pull requests

Reference and execution workflow for authoring, submitting, and updating pull requests across the DevTools monorepo. Follow all pull request conventions, documentation, and rules in the codebase (such as `docs/contributing/pull-requests.md` and `docs/contributing/stacked-prs.md`).

## 1. Single vs. Stacked PR Decision Gate

- **Single pull request (default):** Use when the changeset is a cohesive vertical slice under 5,000 lines of code and fewer than 80 modified files.
- **Stacked pull request chain:** Follow all conventions, documentation, and rules related to stacked pull requests in the codebase (`docs/contributing/stacked-prs.md`). Use when changes exceed 5,000 lines of code or 80 files, or when a feature spans distinct architectural layers (foundation, shared packages, backend daemon, and frontend).

## 2. Pull Request Title Validation

Pull request titles become the squash commit subject on `main` evaluated by Release Please.

- Format: `<type>[optional (<scope>)]: <imperative description>`
- Types: `feat` (user-facing capabilities), `fix` (bug patches), `chore` (internal tooling, scripts, agent governance), `docs`, `refactor`, `perf`, `test`, `build`, `ci`.
- Scope: Single-noun lowercase matching physical directory (`cli`, `frontend`, `site`, `browser`, `core`, `db`, `lighthouse`, `adr`, `testing`, `ci`, `scripts`, `deps`). Omit scope for root configurations and cross-cutting maintenance. Do not use `(repo)`.
- Never include issue numbers (`(#123)`) in titles.

Validate the title before submitting:

```bash
echo "<title>" | bunx commitlint
```

## 3. Pull Request Body Structure

Follow [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md):

- **Issue linking:** Include `Closes #<issue>` in single PRs or the top PR of a stack. Include `Part of #<issue>` in intermediate stack layers.
- **Visual diagrams:** For the `## Summary` section, consult [`../show-me/SKILL.md`](../show-me/SKILL.md) to pick the smallest visual view (component tree, shallow file tree, Mermaid diagram, or diff sketch) that clarifies the change.
- **Evidence:** Provide before/after terminal commands or test run outputs.
- **Path hygiene:** Cite permanent repository-relative paths only. Never mention ephemeral `.scratch/` paths, raw session logs, or internal agent prompts.

## 4. Safe GitHub CLI & REST API Operations

Avoid `gh pr edit` and bare `gh pr view` or `gh issue view`, which query deprecated `projectCards` GraphQL fields and exit `1`.

- **Inspect pull request:**
  ```bash
  gh pr view <number> --json number,title,body,state,isDraft,baseRefName,headRefName,url
  ```
- **Update pull request metadata:**
  Update titles and bodies via GitHub REST API:
  ```bash
  gh api --method PATCH repos/{owner}/{repo}/pulls/<number> -f title="<title>" -F body=@<body-file>
  ```
- **Stacked PR submission:**
  Submit stacks ready for review with `--open`:
  ```bash
  gh stack submit --auto --open
  ```
  Then patch individual PR bodies and titles using the REST endpoint above.

## 5. Tracking Issue Checklist & Git Checkpoint

Before submitting or updating a pull request:

1. Query the linked issue:
   ```bash
   gh issue view <issue_number> --json number,title,body,state,labels
   ```
2. Update verified acceptance criteria from `- [ ]` to `- [x]` using `gh issue edit <issue_number> --body "$UPDATED_BODY"`.
3. Obtain explicit user confirmation at the git checkpoint before executing `git push`, opening a pull request, or mutating stacks.
