# GitHub Actions gotchas

Behavior that linters miss and config files do not reveal. Check the relevant section when debugging or reviewing.

## The workflow never ran

- Events caused by `GITHUB_TOKEN`, such as pushes or labels added by a workflow, trigger no new workflow runs. The three exceptions are `workflow_dispatch` in the same repository, `repository_dispatch` in the same repository, and `pull_request` (`opened`, `synchronize`, `reopened`), which creates runs in an approval-required state until a maintainer with write access approves them. Use a GitHub App token when downstream workflows must start automatically.
- `schedule` runs only from the default branch. In public repositories, GitHub disables scheduled workflows after 60 days without repository activity, and scheduled workflows are disabled by default on new forks.
- A workflow skipped by `paths`, `paths-ignore`, or a branch filter leaves its required status check pending forever, blocking merges. For required checks, run the workflow on every PR and skip heavy work inside the job, or include a final job that always reports.
- Workflows configured as required status checks must also trigger on `merge_group` if GitHub merge queues are enabled, or queued PRs hang waiting for checks.
- Both `pull_request_target` and `workflow_run` run the workflow file from the repository's default branch (`GITHUB_SHA` and `GITHUB_REF` point to the default branch, even when the PR targets another branch). Editing either workflow in a PR changes nothing until merged. On public repositories, GitHub enforces blocking `pull_request_target` by default starting December 2, 2026 unless explicitly enabled.
- For fork PRs, `github.event.workflow_run.pull_requests` is empty and `github.event.workflow_run.head_repository.full_name` can be `null` if the fork was deleted. Resolve or verify the target PR via `github.event.workflow_run.head_sha` through the GitHub API rather than trusting an unverified artifact field.
- A workflow file with a YAML or schema error does not run at all, and the error appears only on the Actions tab. `scripts/lint.sh` catches these locally.

## Expressions

- `if: ${{ inputs.deploy }} == 'true'` mixes an expression with literal text. The result is a non-empty string, so the condition is always true. Put the whole condition inside one `${{ }}` expression, or omit `${{ }}`.
- Multiline block scalars such as `if: |\n  ${{ false }}` evaluate truthy because the trailing newline produces a non-empty string (`unsound-condition`). Keep `if:` expressions single-line or use `|-`.
- An `if:` starting with `!` must be wrapped in `${{ !... }}` or quoted as `"!..."` so YAML does not treat the leading `!` as a tag.
- `inputs.flag` keeps its declared type, such as boolean `true`, whereas `github.event.inputs.flag` is always the string `'true'`.
- `secrets.*` cannot appear in `if:`. Map the secret to a job-level `env:` and test `env.NAME != ''` in a step `if:`. Job-level `if:` has no `env` or `secrets` context.
- When a job in `needs` fails, dependent jobs are skipped. `if: always()` also runs after a manual cancellation; use `if: ${{ !cancelled() }}` for cleanup and reporting jobs.

## Tokens and secrets

- Fork PRs and Dependabot PRs under `pull_request` get a read-only token and no repository secrets. Dependabot runs read from the separate Dependabot secrets store.
- A job output containing an exact secret string is redacted on the runner and arrives empty in dependent jobs.
- The repository or organization default token permission applies to every job lacking a `permissions:` key. Setting `permissions: {}` at the top makes each job's grants explicit and independent of that setting.

## Composite actions and reusable workflows

- Every `run:` step inside a `using: composite` action must declare `shell:`.
- Composite actions cannot read `secrets.*` directly and cannot call `workflow_call` reusable workflows. Pass secrets via `inputs:` and remember that composite `inputs.*` are strings and remain expression-injection-tainted in `run:` blocks unless routed through `env:`.
- `actionlint` ignores `.github/actions/*/action.yml`; run `zizmor` via `scripts/lint.sh` to audit composite actions.
- Reusable workflows (`workflow_call`) cannot exceed the caller's `permissions:` ceiling (a caller with `permissions: {}` blocks callee writes unless the caller grants them) and are limited to 10 nesting levels and 20 unique reusable workflows per call tree.

## Checkout and job state

- On `pull_request`, `actions/checkout` checks out the merge commit `refs/pull/N/merge`, not the PR head. Pass `ref: ${{ github.event.pull_request.head.sha }}` when you need the head commit.
- The default `fetch-depth: 1` has no commit history or tags. `git describe`, changelog generation, and `git diff origin/main...` need `fetch-depth: 0` or an explicit depth plus fetching the base branch.
- Writes to `$GITHUB_ENV` and `$GITHUB_PATH` apply from the next step onward, never inside the step that writes them.
- Every job starts on a fresh runner. Files pass between jobs only via artifacts, and scalar values pass only via job `outputs`.

## Concurrency and caches

- By default (`queue: single`), a concurrency group holds at most one running and one pending run; a newer pending run replaces the older pending one even with `cancel-in-progress: false`, dropping intermediate commits. Set `queue: max` with `cancel-in-progress: false` to queue up to 100 pending runs sequentially.
- Caches are scoped by branch. A PR can restore caches saved on its own ref, its target base branch, and the default branch, never caches from another PR. A cache key that never changes saves once and never updates; include a lockfile hash via `hashFiles(...)`.

## Tooling

- `uses: $/path` is GitHub's self-repository syntax (July 2026), which pins a local action to the running commit without a checkout. `zizmor` (`self-repository` audit) recommends it, while `actionlint` 1.7.12 rejects it under `[action]`. Keep `./path` and disable `self-repository` in `.github/zizmor.yml` until `actionlint` supports `$/path`:

  ```yaml
  rules:
    self-repository:
      disable: true
  ```

- `actionlint` 1.7.12 also rejects `concurrency.queue` (`[syntax-check]`) because the schema predates May 2026 `queue: max`.
