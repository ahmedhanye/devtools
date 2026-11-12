---
name: github-actions
description: GitHub Actions workflows, composite actions, and Dependabot action config. Use when writing, reviewing, or hardening `.github/workflows/`, `.github/actions/`, or `.github/dependabot.yml`, or when a CI run fails or never starts.
---

# GitHub Actions

A workflow is a trust boundary. Treat PR titles, bodies, branch names, comments, commit messages, fork code, and fork artifacts or caches as tainted data, never code or privileges.

Look up action versions, commit SHAs, and inputs with the tools below instead of writing them from memory.

## Tools

Script paths are relative to this skill's folder:

- `scripts/pin-action.sh <owner/repo[/path]> [tag]` prints a pinned `uses:` line (`owner/repo@<sha> # vX.Y.Z`) from upstream tags and exits `0`.
- `scripts/lint.sh [--online]` runs native `actionlint`, `zizmor`, and `shellcheck` on workflows, composite actions, `run:` blocks, and `.github/**/*.sh`, exiting `0` when clean. When missing `PATH` binaries cause a non-zero exit, consult [references/install.md](references/install.md) and recommend installing them instead of skipping linting. `--online` needs a `GH_TOKEN` with public-repo read access and adds `impostor-commit`, `known-vulnerable-actions`, `ref-confusion`, and `stale-action-refs`.
- Inspect an action's inputs at its pinned SHA via `gh api "repos/OWNER/REPO/contents/action.yml?ref=SHA" --jq .content | base64 -d`.

## Pick the branch

- Creating or modifying a workflow or composite action: **Write**.
- Auditing or hardening existing workflows, or reviewing a PR touching `.github/`: **Review**.
- A workflow run failed, hangs, or never started: **Debug**.

## Write

1. **Survey.** Read `.github/`, lockfiles, and runtime version files (such as `package.json`, `.nvmrc`, `pyproject.toml`, or `.tool-versions`). Done when you know the package manager, runtime source of truth, and existing composite actions to reuse.
2. **Choose triggers.** Run untrusted PR code under `pull_request`; restrict `pull_request_target` and `issue_comment` to metadata-only jobs or split privileged follow-ups via [references/templates.md](references/templates.md). Done when no job combines secrets or write permissions with tainted code.
3. **Draft and harden.** Start from the closest template and apply every item in the hardening checklist below. Done when every applicable checklist item is satisfied.
4. **Pin.** Resolve external actions, reusable workflows, images, and binaries per the Supply chain checklist. Done when `scripts/pin-action.sh` exits `0` for every external `uses:`.
5. **Lint.** Run `scripts/lint.sh` and fix every error. Done when `scripts/lint.sh` exits `0`.
6. **Verify in CI.** Once pushed, watch the run with `gh run watch <id> --exit-status`. Done when you report a passing run URL or state why CI verification could not run.

## Review

1. Run `scripts/lint.sh --online`. If `GH_TOKEN` cannot read public repos, run `scripts/lint.sh` and note that online audits were skipped.
2. Audit every workflow and composite action against the hardening checklist and [references/gotchas.md](references/gotchas.md) for flaws linters miss (such as `workflow_run` trusting an artifact PR number, deploy concurrency cancelling mid-deploy, or path filters on required checks).
3. Group findings by severity: Critical (tainted code or data reaches a secret, write token, or `id-token`), High (expression injection, unpinned actions or images, tainted `$GITHUB_ENV` writes), Medium (broad permissions, persisted checkout credentials, unverified binary downloads, long-lived cloud keys), Low (missing timeouts, missing concurrency cancellation, inline scripts over five lines).

Done when the report states the count of audited files and lists all findings with line numbers and fixes, or confirms none were found. See [references/security.md](references/security.md) for attack mechanics.

## Debug

1. **Inspect logs.** Run `gh run list --branch <branch> --limit 5`, then `gh run view <id> --log-failed`. Done when you identify the failing command line with secrets redacted.
2. **Classify.**
   - Not started or skipped: Check triggers, `merge_group`, and expressions in `references/gotchas.md`.
   - YAML, expression, or permission error: Run `scripts/lint.sh` and check `references/gotchas.md`.
   - Step command failure: Reproduce locally with the workflow's command and runtime version.
3. **Collect debug traces.** When local reproduction stalls, re-run with `gh run rerun <id> --failed --debug` for runner diagnostic logs.
4. **Fix and confirm.** Re-run `scripts/lint.sh` and watch CI with `gh run watch <id> --exit-status`. Done when `scripts/lint.sh` exits `0` and the CI run passes or a remaining blocker is reported.

## Hardening checklist

### Trust boundaries

- [ ] Run untrusted PR code under `pull_request`, never `pull_request_target`, `workflow_run`, `issue_comment`, or `discussion*`.
- [ ] Pass context values through `env:` and read `"$VAR"`, with zero `${{ }}` inside `run:` or `actions/github-script`.
- [ ] Download untrusted artifacts to `${{ runner.temp }}`, validate PR targets against `workflow_run.head_sha` and data schemas, and never execute them.
- [ ] Keep tainted values out of `$GITHUB_ENV` and `$GITHUB_PATH`; delimit multiline `$GITHUB_OUTPUT` values with `openssl rand -hex 16`.

### Privilege and credentials

- [ ] Default top-level `permissions: {}` and grant each job only needed scopes with comments explaining write permissions.
- [ ] Set `persist-credentials: false` on `actions/checkout` unless committing or pushing, and omit `allow-unsafe-pr-checkout: true`.
- [ ] Use OIDC (`id-token: write`) and protected `environment:` blocks with branch and reviewer rules instead of long-lived secrets.
- [ ] Pass explicit named secrets to `workflow_call` instead of `secrets: inherit`, and avoid `fromJSON(secrets.*)` so logs mask secrets.
- [ ] Restrict self-hosted runners to private repositories with ephemeral environments.

### Supply chain and LTS versions

- [ ] Pin external actions and reusable workflows to 40-char SHAs via `scripts/pin-action.sh`, images to `@sha256:`, and downloaded binaries to SHA-256 checksums.
- [ ] Lock runtimes to Active LTS or repo version files, and install dependencies with frozen lockfiles.
- [ ] Track current stable major action lines, use `ubuntu-latest` or explicit LTS runners, and set a 7-day `cooldown` for `github-actions` in `.github/dependabot.yml`.

### Operational resilience

- [ ] Set `timeout-minutes` on every job, `cancel-in-progress: true` for PR workflows, and `cancel-in-progress: false` for deploy workflows.
- [ ] Keep inline `run:` blocks to five lines or fewer; extract larger logic to standalone scripts such as `.github/scripts/*.sh` (`#!/usr/bin/env bash`, `set -euo pipefail`).
- [ ] Extract repeated multi-step sequences into `.github/actions/<name>/action.yml` with explicit `shell:` on every `run:` step.
