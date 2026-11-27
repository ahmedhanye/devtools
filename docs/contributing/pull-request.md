# Pull requests

Shared rules for triaging, titling, describing, labeling, and verifying every pull request, plus routing to single-PR and stacked-PR workflows.

## Choose a PR workflow

| Guide                                                | Read when                                                                                |
| :--------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| [Single pull requests](pull-request/single-pr.md)    | Changeset stays under **5,000 LOC** and **80 files** within one vertical slice.          |
| [Stacked pull requests](pull-request/stacked-prs.md) | Changeset exceeds **5,000 LOC** or **80 files**, or spans multiple architectural layers. |

For replying to open review threads after pushing fixes, see [Pull request comments](pull-request/comments.md) (primarily paired with [Pushing changes](push.md)).

## Triage and GitHub CLI notes

External pull requests are not treated as feature requests; new capabilities begin as tracking issues.

- **Read a PR.** `gh pr view <number> --json number,title,body,labels,comments` and `gh pr diff <number>`.
- **List open PRs.** `gh pr list --state open --json number,title,body,labels,author,comments`.
- **File-filtered PR diffs.** `gh pr diff <number>` does not take path arguments; use `git diff origin/main...HEAD -- <path>`.
- **Check-run polling.** `gh pr checks <number>` exits `8` while checks are pending; pass `--watch` to await completion.

> [!NOTE]
> On `gh 2.46.0`, bare `gh pr view <number>` and `gh pr edit <number>` fail on deprecated `projectCards` GraphQL queries, and `gh pr checks` does not support `--json`. Pass explicit `--json` fields on `pr view`, use plain `gh pr checks <number>` (or `gh api repos/{owner}/{repo}/commits/<sha>/check-runs`), and use REST `gh api --method PATCH` to update titles, bodies, labels, or assignees.

## Shared pull request rules

1. **Link the tracking issue.** `gh issue develop` links branches automatically. Include `Closes #<issue>` in the PR body (or `Part of #<issue>` on intermediate layers of a stacked PR, reserving `Closes #<issue>` for the final top layer).
2. **Assign and label.** Assign yourself (`@me`) and attach matching `area:*` (`area:backend`, `area:cli`, `area:frontend`, `area:docs`, `area:tooling`) and `type:*` labels (`CODEOWNERS` requests maintainer review automatically).
3. **Follow the PR template.** Match [`.github/PULL_REQUEST_TEMPLATE.md`](../../.github/PULL_REQUEST_TEMPLATE.md) and [Description visuals and evidence](#description-visuals-and-evidence). Cite permanent repository-relative paths only, omitting temporary local paths or raw debug logs.
4. **Conventional Commit PR titles.** Because squash merging commits only the PR title with an empty body on `main`, Release Please evaluates the PR title directly per [Commits](commits.md):
   - **Deterministic CI + semantic AI review.** [`.github/workflows/pr-title.yml`](../../.github/workflows/pr-title.yml) enforces syntax, allowed types, clean optional scope syntax, no `#123` issue references, and length (**65 characters or fewer**; **64** at PR `#1000+` so GitHub's ` (#NNN)` fits in 72 characters). CodeRabbit checks that the type, scope, and summary logically match the delivered diff and use canonical workspace scopes without synonym drift.
   - **Primary deliverable scope.** Name the title after the primary delivered area using canonical workspace names (`api`, `cli`, `frontend`, `browser`, `core`, `db`, `lighthouse`, `site`, `deps`) or a clear sub-scope (`cli/audit`). Omit the scope for cross-cutting or root work (`feat: ...`, `ci: ...`, `docs: ...`, `chore: ...`). Never use `(repo)` or comma-separated scopes.
   - **Release safety and breaking changes.** Reserve `feat` for end-user runtime capabilities (minor bump), `fix` for runtime bug fixes or security dependency patches (`fix(deps)`, patch bump), `perf`/`revert` for runtime performance or reverts (patch bump), and `ci:` for CI/workflow changes. Never use release-triggering types on non-runtime areas (`site`, `docs`, `agents`, `scripts`, `ci`). Mark breaking runtime changes with `!:` in the title (for example, `feat(cli)!: ...`) so Release Please bumps major without needing a squash body.
5. **Before and after evidence.** Use `## Evidence` solely for concrete **Before** and **After** proof matching [Evidence](#evidence).
6. **Sync issue checklists and project status.** Before opening the PR, inspect the linked ticket (`gh issue view <ticket_number> --json number,title,body,state,labels`) and parent Spec (`gh api repos/{owner}/{repo}/issues/<ticket_number>/parent --jq .number 2>/dev/null`), toggle completed `- [ ]` checkboxes to `- [x]` via `gh issue edit`, and move the item to `In Review` per [Project board status lifecycle](issues.md#project-board-status-lifecycle).

## Description visuals and evidence

Skip preambles, keep prose brief, and use canonical domain terms from [`GLOSSARY.md`](../../GLOSSARY.md).

### Summary visuals

Pick the smallest view that makes the change clear and place it next to the short sentence it supports. Use one visual when it answers the reviewer's question; rarely use more than two.

| Change shape                                      | Preferred fence | What to show                                                                                    |
| :------------------------------------------------ | :-------------- | :---------------------------------------------------------------------------------------------- |
| Delta inside an existing tree, component, or flow | ` ```diff `     | Prefix added lines with `+` and removed lines with `-` while keeping minimal unchanged context. |
| New file layout or broad module responsibility    | ` ```text `     | Shallow file tree with short `#` responsibility comments.                                       |
| New UI hierarchy or runtime call path             | ` ```text `     | Component tree (with file or package boundaries), call tree, or short pseudocode.               |
| Multi-component interaction or data flow          | ` ```mermaid `  | Focused `sequenceDiagram` or `flowchart`.                                                       |

Prefer ` ```diff ` whenever the surrounding structure already exists so GitHub renders green additions and red removals:

```diff
 src/
 ├── commands/
+│   └── audit.ts         # runs lighthouse budget checks
 ├── sessions/
-└── transport.ts
+└── transport/
+    ├── client.ts
+    └── stream.ts
```

Use the same ` ```diff ` pattern for component trees, call trees, and state or control-flow deltas:

```diff
 on(save)
-  write content
+  if content is unchanged
+    return cached result
+  write new content
+  invalidate cache
```

### Evidence

Keep `## Evidence` strictly to **Before** and **After** on separate lines, with no extra subheadings:

```markdown
## Evidence

- **Before:** <what happened, failed, or was missing before this change>
- **After:** <matching observable behavior or outcome after this change>
```

- **Show behavioral deltas, not CI checklists.** Pair what failed or was missing before with what happens now (a concrete repro, focused test behavior, or guard output). Omit routine CI gates (`lint`, `format`, `typecheck`, full `test:coverage`, `verify:diff-coverage`, `audit`) that GitHub Actions already reports on the PR.
- **Include non-CI runtime checks when relevant.** When touching CLI commands or terminal formatters, report cold-start timing (`< 100ms`), `NO_COLOR=1`, and non-TTY `stdout`/`stderr` separation proof.

### Merge danger

- **Door.** Mark `two-way` when the PR is cheap to revert cleanly. Mark `one-way` for destructive or hard-to-reverse changes (database migrations, removed public APIs, breaking wire contracts) and state the rationale.
- **Blast radius.** State the concrete scope of potential impact (affected consumers, layout shift, CLI flags, or CI workflows).
