# Pull requests and code review

Guidelines for creating, reviewing, resolving threads, and merging pull requests.

## Triage and inspection

External pull requests are not treated as feature requests. New capabilities must begin as issues.

When inspecting pull requests:

- **Read a PR:** `gh pr view <number> --json number,title,body,labels,comments` and `gh pr diff <number>` for the diff.
- **List PRs:** `gh pr list --state open --json number,title,body,labels,author,comments`

### GitHub CLI operational notes

- **File-filtered PR diffs:** `gh pr diff <number>` does not accept path arguments. To inspect specific files on a PR branch, run `git diff origin/main...HEAD -- <path>`.
- **Check run exit codes:** `gh pr checks <number>` exits with code `8` when CI checks are pending or in progress; use `gh pr checks <number> --watch` to await completion.

## Pull request rules

1. **Link the tracking issue:** `gh issue develop` links the issue automatically. When creating manually, add `Closes #<issue>` to the pull request description (or `Part of #<issue>` for intermediate layers of a stacked PR).
2. **Self-assign the pull request:** Assign yourself as the Directly Responsible Individual (DRI) when opening a pull request by passing `--assignee "@me"` (maintainer review is automatically requested via `CODEOWNERS`).
3. **Follow the pull request structure:** PR descriptions must describe user-facing changes to `main` following [.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md) (Summary with structural diff/tree, Evidence, and Merge Danger). Pull request descriptions cite permanent codebase paths and omit temporary local paths or raw debug session logs.
4. **Follow Conventional Commits for pull request titles:** Pull request titles must follow the exact Conventional Commits specification and [Type × Scope Matrix](commits.md#static-scope-taxonomy-and-type--scope-matrix) (`<type>[optional (<scope>)]: <imperative description>`). Because linear squash merging is enforced, the PR title forms the single squash commit subject on `main` evaluated by Release Please:
   - Reserve `feat` strictly for end-user product capabilities in runtime packages and apps (triggers minor version releases).
   - Reserve `fix` strictly for runtime bug patches and security dependency bumps.
   - Name the PR title after the ticket's **primary deliverable** (e.g. `feat(cli): add lighthouse audit command` for a CLI feature even if accompanied by documentation, scripts, and tests).
   - If a PR deliverable is purely internal agent skills/rules/governance, use `docs(agents): <description>`.
   - If a PR deliverable is CI workflow automation, use `chore(ci): <description>`.
   - If a PR deliverable is internal scripts/tooling, use `chore(scripts): <description>`.
   - Avoid comma-separated or combined scopes (e.g., do not use `feat(frontend,site)`; choose the primary deliverable scope or stack into separate PRs).
   - Keep issue references (`#123`) out of the PR title; place them in the description body instead.
   - **Pre-validate title locally:** Verify the title against commitlint rules before submission:
     ```bash
     echo "<proposed-title>" | bunx commitlint
     ```
5. **Stacked pull requests:** For changesets exceeding 5,000 lines of code or 80 files, or spanning multiple architectural layers, follow [Stacked Pull Requests](stacked-prs.md) to decompose work into reviewable layers.
6. **Provide verification evidence mapped to issue criteria:** The `## Evidence` section in the PR description must mirror the acceptance criteria declared in the tracking issue:
   - **Acceptance criteria verification:** Copy the automated acceptance criteria list from the linked issue and verify each item with concrete observable output (command snippets, exit codes, or UI screenshots).
   - **Test suite and diff-coverage:** Include test execution logs (`bun test`) and diff-coverage verification (`bun run verify:diff-coverage`).
   - **Formatting and environment compliance:** Include CLI timing (e.g. `< 100ms`), `NO_COLOR=1`, and non-TTY stream separation proof (`stdout` for reports, `stderr` for progress) when touching CLI commands or terminal formatters.
7. **Verify tracking issue checklist:** Before opening the pull request, inspect the linked ticket description (`gh issue view <ticket_number> --json number,title,body,state,labels`) and its parent Spec description (`gh api repos/{owner}/{repo}/issues/<ticket_number>/parent --jq .number 2>/dev/null`) to confirm all acceptance criteria are met. Update completed task checkboxes from `- [ ]` to `- [x]` in the ticket and parent Spec descriptions via `gh issue edit <number> --body "$UPDATED_BODY"`.
8. **Open the pull request non-interactively:** Create the pull request using explicit title and body flags or `--fill` to avoid interactive terminal prompts:
   ```bash
   gh pr create --assignee "@me" --fill
   ```
   If maintaining tracking status on a GitHub Project, update the ticket item to `<in_review_option_id>` using the commands in [Issue tracking: Project board status lifecycle](issues.md#project-board-status-lifecycle).

## Review thread resolution

Branch protection enforces required review thread resolution. All comment threads opened by reviewers or automated review bots (such as CodeRabbit) must be resolved before merge eligibility.

Review thread resolution is performed **post-push** so that the remote pull request on GitHub reflects the committed fixes before threads are resolved. Follow the inspection, investigation, and resolution actions in [Pull request comments and thread resolution](pr-comments.md).

## Merging pull requests

Squash merge into `main` after all review threads and status checks pass. When merging, commit only the PR title with an empty body to maintain a clean linear git log on `main`:

```bash
gh pr merge <pr_number> --squash --body "" --delete-branch
```

Linear history with squash merging is enforced by repository rulesets.
