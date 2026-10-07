# GitHub Actions gotchas

Behaviour that no linter flags and no config file reveals. Check the relevant section when a run misbehaves or when reviewing.

## The workflow never ran

- Events caused by `GITHUB_TOKEN` (a push, a PR opened, a label added by a workflow) trigger no new workflow runs. `workflow_dispatch` and `repository_dispatch` are the exceptions. To trigger downstream workflows, use a GitHub App token.
- `schedule` runs only from the default branch. In public repos, GitHub disables scheduled workflows after 60 days without repository activity.
- A workflow skipped by `paths`, `paths-ignore`, or a branch filter leaves its required status check pending forever, which blocks the merge. For required checks, run the workflow on every PR and skip work inside the job, or have a final job that always reports.
- `pull_request_target` runs the workflow file from the PR's base branch, and `workflow_run` runs it from the default branch. Editing either file in a PR changes nothing until the edit is merged.
- A workflow file with a YAML or schema error does not run at all, and its error shows only on the Actions tab. `lint.sh` catches these.

## Expressions

- `if: ${{ inputs.deploy }} == 'true'` mixes an expression with literal text. The result is a non-empty string, so the condition is always true. Put the whole condition inside one expression, or omit `${{ }}`.
- An `if:` that starts with `!` must be wrapped in `${{ }}`, because YAML reads a leading `!` as a tag.
- `inputs.flag` keeps its declared type (boolean `true`), but `github.event.inputs.flag` is always the string `'true'`.
- `secrets.*` cannot appear in `if:`. Map the secret to a job-level `env:` and test `env.NAME != ''`.
- When a job in `needs` fails, dependent jobs are skipped. `if: always()` also runs after a manual cancel. Use `if: ${{ !cancelled() }}` for cleanup and report jobs.

## Tokens and secrets

- Fork PRs and Dependabot PRs under `pull_request` get a read-only token and no repository secrets. Dependabot runs read from the separate Dependabot secrets store.
- A job output that contains a secret is redacted on the runner and arrives empty in dependent jobs.
- The repo or org default token permission applies to every job without a `permissions:` key. Setting `permissions: {}` at the top makes each job's grants explicit and independent of that setting.

## Checkout and job state

- On `pull_request`, `actions/checkout` checks out the merge commit `refs/pull/N/merge`, not the PR head. Use `github.event.pull_request.head.sha` when the head is what you need.
- The default `fetch-depth: 1` has no history and no tags. `git describe`, changelog generation, and `git diff origin/main...` need `fetch-depth: 0`, or a deliberate depth plus a fetch of the base branch.
- Writes to `$GITHUB_ENV` and `$GITHUB_PATH` apply from the next step onward, not within the step that writes them.
- Every job runs on a fresh machine. Files pass between jobs only through artifacts, and values only through job `outputs`.

## Concurrency and caches

- A concurrency group holds at most one running and one pending run. A newer pending run replaces the older pending one even with `cancel-in-progress: false`, so queued deploys of intermediate commits are dropped.
- Caches are scoped by branch. A PR can restore caches saved on its own ref and on the default branch, never caches from another PR. A cache key that never changes saves once and never updates; include a lockfile hash with `hashFiles(...)`.

## Tooling

- `uses: $/path` is GitHub's self-repository syntax (July 2026), which pins a local action to the running commit without a checkout. zizmor's `self-repository` audit suggests it, but actionlint 1.7.12 rejects it. Until actionlint supports it, keep `./path` and disable the audit in `.github/zizmor.yml`:

  ```yaml
  rules:
    self-repository:
      disable: true
  ```
