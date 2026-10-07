# GitHub Actions templates

Use these canonical templates as starting baselines. Pinned SHAs reflect verified releases; update them in-place with `bun run pin:actions`.

## 1. CI workflow with security scanning

Handles pull requests and main pushes with least privilege, concurrency cancellation, pinned action SHAs, timeouts, and automated security scanning via `zizmor`.

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - uses: ./.github/actions/setup

      - run: bun run verify

  security:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - uses: zizmorcore/zizmor-action@cc914d7f3750a2d13d75c7f184a1060aa0e9d482 # v0.6.4
```

## 2. Composite setup action

Extract repeated toolchain setups and dependency caching into `.github/actions/setup/action.yml`. Use frozen lockfiles for package installs.

```yaml
name: Setup
description: Install Bun and workspace dependencies from the lockfile

runs:
  using: composite
  steps:
    - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
      with:
        bun-version-file: package.json

    - shell: bash
      run: bun install --frozen-lockfile
```

## 3. Automated action updates (Dependabot)

Configure automated dependency updates in `.github/dependabot.yml`.
Reference: [Official Dependabot configuration documentation](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file)

Essential security settings:
- `cooldown`: Delay updates by 7 days to protect against zero-day supply chain compromises.
- `groups`: Batch updates into a single pull request to prevent notification noise.

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    cooldown:
      default-days: 7
    groups:
      actions:
        patterns: ["*"]
```

## 4. Tainted input handling

Pass user-controlled values through environment variables instead of inline expressions. When writing multiline values to `$GITHUB_OUTPUT`, use a random delimiter.

```yaml
name: summary

on:
  pull_request:

permissions: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  summarize:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - id: summary
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
          PR_BODY: ${{ github.event.pull_request.body }}
        run: ./.github/scripts/summarize.sh

      - env:
          SUMMARY: ${{ steps.summary.outputs.summary }}
        run: printf '%s\n' "$SUMMARY" >> "$GITHUB_STEP_SUMMARY"
```

`.github/scripts/summarize.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

summary="$(printf '## %s\n\n%s\n' "$PR_TITLE" "$(head -c 2000 <<<"$PR_BODY")")"

delimiter="$(openssl rand -hex 16)"
{
  echo "summary<<${delimiter}"
  echo "$summary"
  echo "$delimiter"
} >> "$GITHUB_OUTPUT"
```

## 5. Cloud deployment using OpenID Connect (OIDC)

Authenticate with cloud providers using short-lived tokens instead of storing long-lived credentials in repository secrets.

```yaml
name: deploy

on:
  push:
    branches: [main]

permissions: {}

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: production
    permissions:
      contents: read
      id-token: write # Mint OIDC token for role assumption
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - uses: aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd # v6.3.0
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-production
          aws-region: us-east-1

      - run: ./.github/scripts/deploy.sh
```

## 6. Privileged processing for fork pull requests

Split workflows when untrusted fork pull requests require privileged actions like posting comments or uploading to private registries.

### Step 1: Unprivileged build (`pr-build.yml`)

```yaml
name: pr-build

on:
  pull_request:
    branches: [main]

permissions: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - uses: ./.github/actions/setup

      - run: bun run build

      - env:
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: |
          mkdir -p report
          echo "$PR_NUMBER" > report/pr-number
          cp dist/metrics.json report/

      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: pr-report
          path: report/
```

### Step 2: Privileged reporting (`pr-report.yml`)

```yaml
name: pr-report

on:
  # Triggered upon completion of the unprivileged build.
  workflow_run:
    workflows: [pr-build]
    types: [completed]

permissions: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.event.workflow_run.head_repository.full_name }}-${{ github.event.workflow_run.head_branch }}
  cancel-in-progress: true

jobs:
  comment:
    if: github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      actions: read # Download build artifact
      pull-requests: write # Post comment to pull request
    steps:
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        with:
          name: pr-report
          path: ${{ runner.temp }}/pr-report
          github-token: ${{ github.token }}
          run-id: ${{ github.event.workflow_run.id }}

      - env:
          GH_TOKEN: ${{ github.token }}
          REPORT_DIR: ${{ runner.temp }}/pr-report
        run: |
          PR_NUMBER="$(cat "$REPORT_DIR/pr-number")"
          [[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || { echo "invalid PR number" >&2; exit 1; }
          gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file "$REPORT_DIR/metrics.json"
```
