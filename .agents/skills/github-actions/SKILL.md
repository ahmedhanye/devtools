---
name: github-actions
description: GitHub Actions workflows and composite actions. Use when writing, reviewing, or hardening anything under `.github/workflows/` or `.github/actions/`, or when a CI run is red or never started.
---

# GitHub Actions

A workflow is a trust boundary. The core rule is that **tainted** data must never reach a shell, a secret, or a write token. Tainted data includes PR titles, bodies, and branch names, comments, commit messages, fork code, and artifacts or caches produced by fork runs. Tainted data stays data. It never becomes code and never executes next to a privilege.

Resolve facts instead of recalling them. Action versions, commit SHAs, and input names drift faster than training data. A SHA written from memory is either stale or invented. The scripts below do the lookups.

## Tools

- `scripts/pin-action.sh <owner/repo[/path]> [tag]` prints a pinned `uses:` line (`owner/repo@<sha> # vX.Y.Z`) for the latest release or a given tag, resolved directly from upstream tags.
- `scripts/lint.sh [--online]` runs actionlint (with shellcheck on `run:` blocks), zizmor, and shellcheck on `.github/**/*.sh`. Exit 0 means clean. `--online` adds zizmor's impostor-commit and known-vulnerable-action audits.
- To inspect an action's inputs directly, read its definition at the pinned SHA: `gh api "repos/OWNER/REPO/contents/action.yml?ref=SHA" --jq .content | base64 -d`.

Script paths are relative to this skill's folder.

## Pick the branch

- Creating or modifying a workflow or composite action: **Write**.
- Auditing or hardening existing workflows, or reviewing a PR touching `.github/`: **Review**.
- A workflow run failed, hangs, or never started: **Debug**.

## Write

1. **Survey.** Read the `.github/` tree, lockfile, and runtime version sources (`packageManager` in `package.json`, `.nvmrc`, `.tool-versions`). Note the package manager and existing composite actions to reuse.
2. **Choose triggers.** Use `pull_request` for jobs that run PR code. Use `pull_request_target` only for metadata jobs (labels, triage) that never check out PR code. When fork PRs require privileged follow-ups (such as posting comments), use the two-workflow pattern in [TEMPLATES.md](TEMPLATES.md). Done when no job both holds a privilege (secrets, write tokens, `id-token: write`) and executes tainted code.
3. **Draft** from the closest template in [TEMPLATES.md](TEMPLATES.md), then apply every item in the hardening checklist below.
4. **Pin.** Run `scripts/pin-action.sh` to resolve all external actions to full commit SHAs. Done when every external `uses:` line contains a 40-character commit SHA with a version comment.
5. **Lint.** Run `scripts/lint.sh`. Fix every reported error. Done when `scripts/lint.sh` exits 0.
6. **Verify in CI.** Ask the user before pushing (the repo's git checkpoint applies). Then monitor the run with `gh run watch <id> --exit-status`. Done when you can report a passing run URL, or you have notified the user why the run could not be verified on GitHub.

## Review

1. Run `scripts/lint.sh --online`. If the token cannot read public repos, run `scripts/lint.sh` and note that online audits were skipped.
2. Check every workflow and composite action against the hardening checklist below and [GOTCHAS.md](GOTCHAS.md). Linters miss architectural flaws: a `workflow_run` job executing an artifact, a deploy concurrency group that cancels mid-deploy, or path filters on required checks.
3. Report findings grouped by severity:
   - Critical: Tainted code or data reaches a secret, write token, or `id-token`.
   - High: Expression injection, unpinned actions, or untrusted writes to `$GITHUB_ENV`.
   - Medium: Permissions broader than required, persisted checkout credentials, or long-lived cloud keys.
   - Low: Missing timeouts, missing concurrency cancellation, or inline scripts longer than five lines.

Done when the report states the number of files audited against every checklist item and lists all findings with line numbers and fixes, or confirms that none were found. See [SECURITY.md](SECURITY.md) for threat details.

## Debug

1. **Inspect failure logs.** Run `gh run list --branch <branch> --limit 5`, followed by `gh run view <id> --log-failed`. Done when you can identify the failing command line, with secrets redacted.
2. **Classify the issue.**
   - Run never started or job was skipped: Consult the trigger section in [GOTCHAS.md](GOTCHAS.md).
   - Workflow error (YAML syntax, expression syntax, permission failure): Run `scripts/lint.sh`, then check [GOTCHAS.md](GOTCHAS.md).
   - Step error (command execution failure): Reproduce locally using the same command and runtime version defined in the setup step.
3. **Collect debug traces.** When local reproduction is blocked, run `gh run rerun <id> --failed --debug` to enable runner diagnostic logs.
4. **Fix and confirm.** Re-run `scripts/lint.sh`, confirm with the user before pushing, and verify with `gh run watch <id> --exit-status`.

## Hardening checklist

### Trust boundaries

- [ ] Untrusted pull request code never runs under `pull_request_target` or `workflow_run`.
- [ ] No `${{ }}` expressions appear inside `run:` blocks or `actions/github-script` code. Context values pass through `env:` and are read as `"$VAR"`.
- [ ] Artifacts and caches from untrusted runs are treated as data, not code. Download them to `${{ runner.temp }}`, validate contents (such as confirming a PR number matches `^[0-9]+$`), and never execute them directly.
- [ ] Tainted values are never written to `$GITHUB_ENV` or `$GITHUB_PATH`. Multiline outputs in `$GITHUB_OUTPUT` use a cryptographically random delimiter (`openssl rand -hex 16`).

### Privilege and credentials

- [ ] Top-level workflow permissions default to `permissions: {}`. Each job explicitly grants only the required permissions, with comments documenting why write scopes are needed.
- [ ] Checkout steps specify `persist-credentials: false` unless the job explicitly commits or pushes to the repository.
- [ ] Cloud authentication uses OpenID Connect (OIDC) via `permissions: id-token: write` and role assumption. No long-lived cloud access keys in secrets.
- [ ] Reusable workflows pass specific named secrets rather than `secrets: inherit`.
- [ ] Self-hosted runners are restricted to private repositories and use ephemeral environments.

### Supply chain and LTS versions

- [ ] Every third-party action is pinned to an immutable 40-character commit SHA with a version comment via `scripts/pin-action.sh`.
- [ ] Language runtimes (Node.js, Bun, Python) are locked to Active LTS or repo source-of-truth files (`packageManager` in `package.json`, `.nvmrc`).
- [ ] Actions track current stable major release lines (e.g. `v4.x`, not unstable pre-releases or deprecated legacy lines).
- [ ] Package managers install dependencies using frozen lockfiles (`bun install --frozen-lockfile`, `npm ci`, or `pnpm install --frozen-lockfile`).
- [ ] Runners default to `ubuntu-latest`, or use explicit LTS images (`ubuntu-24.04`) when specific system packages are required.
- [ ] Automated updates use a 7-day cooldown in Dependabot to protect against zero-day supply chain attacks.

### Operational resilience

- [ ] Every job specifies `timeout-minutes`.
- [ ] Pull request workflows configure concurrency with `cancel-in-progress: true`. Deploy workflows configure concurrency with `cancel-in-progress: false`.
- [ ] Inline `run:` blocks are limited to five lines of glue code. Complex logic lives in standalone scripts under `.github/scripts/` starting with `#!/usr/bin/env bash` and `set -euo pipefail`.
- [ ] Step sequences repeated across multiple jobs are extracted into composite actions under `.github/actions/<name>/action.yml`.
