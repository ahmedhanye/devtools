---
name: pr
description: Create, update, or stack pull requests following repository templates, title conventions, and gh-stack workflows. Use when opening a PR, writing or editing a PR body, splitting large changes (>5,000 LOC or multi-layer) into stacked PRs, or running gh stack commands.
---

# Pull requests

Reference and execution workflow for authoring, submitting, and updating pull requests across the DevTools monorepo. Follow all conventions in [docs/contributing/pull-requests.md](../../../docs/contributing/pull-requests.md) and [docs/contributing/stacked-prs.md](../../../docs/contributing/stacked-prs.md).

## 1. Triage: Deterministic Decision

Inspect the changeset against `origin/main` before drafting PR metadata:

```bash
git diff --shortstat origin/main...HEAD
git log origin/main..HEAD --oneline
```

Evaluate against stacking thresholds: >5,000 lines of code, >80 modified files, or changes spanning multiple architectural tiers or domains ("many directions").

- **Decision rule:** Present only the single correct option. Never offer the user a choice between a single PR and a stacked PR.
  - If any stacking threshold is met: formulate only the **Stacked PR plan**.
  - If within limits in a single domain: formulate only the **Single PR plan**.

## 2. Formulating the Pull Request Plan

Prepare title and body metadata following repository standards:

- **Titles:** Follow `<type>[optional (<scope>)]: <imperative description>` per [docs/contributing/commits.md](../../../docs/contributing/commits.md) and validate with `echo "<title>" | bunx commitlint`. Use single nouns for scopes; omit scopes for cross-cutting changes. Never place issue numbers in titles.
- **Bodies:** Follow [.github/PULL_REQUEST_TEMPLATE.md](../../../.github/PULL_REQUEST_TEMPLATE.md) (Summary with visual structure, Evidence with acceptance criteria mapped from `gh issue view <issue> --json number,title,body`, and Merge Danger).
- **Single PR plan:** Provide the validated title, `Closes #<issue>`, visual summary, and evidence.
- **Stacked PR plan:** Decompose work into dependency-ordered tiers per [docs/contributing/stacked-prs.md](../../../docs/contributing/stacked-prs.md) (Layer 1 tooling/governance/schemas -> Layer 2 packages -> Layer 3 CLI/apps -> Layer 4 docs/frontend). Ensure green CI across all layers:
  1. **Strict dependency ordering:** Lower layers must never depend on code from higher layers.
  2. **Self-contained slices:** Keep runtime changes co-located with their unit tests and type definitions so typecheck, tests, and diff-coverage pass at every layer.
  3. **Layer metadata:** Specify branch (`<issue>-<topic>/<layer-number>-<layer-name>`), scope/commits, validated title, and issue linking (`Part of #<issue>` for intermediate layers; `Closes #<issue>` for the final layer only).

## 3. Checkpoint: User Confirmation

**Pause and present only the chosen PR plan to the user for confirmation.** Never create stack branches, push commits, or submit PRs without explicit approval. Present:

1. `git status` with staged (`git diff --cached --stat`) and unstaged (`git diff --stat`) summaries.
2. The single formulated plan (the single PR plan or the stacked chain breakdown). Do not present alternative options.

Await user confirmation before proceeding to execution.

## 4. Execution & Submission

Once the user approves the plan:

1. **Update tracking issue:** Query the linked issue and mark completed acceptance criteria from `- [ ]` to `- [x]` via `gh issue edit <issue> --body "$UPDATED_BODY"`.
2. **Execute branch submission:**
   - **Single PR:** Push branch and open via `gh pr create --assignee "@me" --fill`.
   - **Stacked PR:**
     - Create each layer branch from its base, applying or cherry-picking assigned commits.
     - Verify every layer passes all CI checks against its base (`bun run check && bun run typecheck && bun test && bun run verify:diff-coverage --base <parent-branch> && bun run build:smoke`). Never submit if any layer fails.
     - Initialize tracking: `gh stack init <branch-1> <branch-2> ...` (or `gh stack add <branch>`).
     - Submit non-interactively: `gh stack submit --auto --open`.
3. **Patch PR metadata:** Update PR titles and bodies non-interactively via GitHub REST API:
   ```bash
   gh api --method PATCH repos/{owner}/{repo}/pulls/<number> -f title="<title>" -F body=@<body-file>
   ```
4. **Safe CLI operations:** Avoid `gh pr edit` and bare `gh pr view` (they query deprecated GraphQL fields). Inspect with `gh pr view <number> --json number,title,body,state,isDraft,baseRefName,headRefName,url`. Always use non-interactive flags for `gh-stack` (`--json`, `--auto`, `--yes`) and never run bare interactive TUI commands.
