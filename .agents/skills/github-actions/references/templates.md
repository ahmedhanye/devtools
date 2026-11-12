# GitHub Actions templates

Generic starting baselines. Resolve current SHAs with `scripts/pin-action.sh` before committing.

## 1. Minimal CI and security workflow

Set `with: advanced-security: false` on `zizmorcore/zizmor-action` if GitHub Code Scanning is disabled.

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
      - run: echo "replace with install and test commands"

  security:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      security-events: write # Upload SARIF results to GitHub Code Scanning
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: zizmorcore/zizmor-action@45d7276c9ca790aabd705e31ca99c6185c3e76dd # v0.8.1
```

## 2. Dependabot (`github-actions`)

Dependabot enforces a 3-day cooldown by default; `default-days: 7` satisfies `zizmor`'s `dependabot-cooldown` rule. For `github-actions`, only `default-days` is supported (`semver-*-days` are unsupported), and cooldown applies only to version updates.

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

## 3. Multiline `$GITHUB_OUTPUT` delimiter

```bash
delimiter="$(openssl rand -hex 16)"
{
  echo "summary<<${delimiter}"
  printf '%s\n' "$VALUE"
  echo "$delimiter"
} >> "$GITHUB_OUTPUT"
```

## 4. OIDC deploy job

```yaml
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
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
```

## 5. Two-workflow `workflow_run` pattern for fork PRs

Split untrusted fork PR builds from privileged follow-ups (`pr-build.yml` + `pr-report.yml`). Verify `headRefOid == "$HEAD_SHA"` and parse structured JSON instead of posting raw artifact bytes.

```yaml
# .github/workflows/pr-build.yml
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
      - env:
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: |
          mkdir -p report
          echo "$PR_NUMBER" > report/pr-number
          printf '{"bytes":0}\n' > report/metrics.json
      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: pr-report
          path: report/
```

```yaml
# .github/workflows/pr-report.yml
name: pr-report
on:
  workflow_run:
    workflows: [pr-build]
    types: [completed]
permissions: {}
concurrency:
  group: ${{ github.workflow }}-${{ github.event.workflow_run.head_repository.full_name || github.event.workflow_run.id }}-${{ github.event.workflow_run.head_branch }}
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
      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: pr-report
          path: ${{ runner.temp }}/pr-report
          github-token: ${{ github.token }}
          run-id: ${{ github.event.workflow_run.id }}
      - env:
          GH_TOKEN: ${{ github.token }}
          HEAD_SHA: ${{ github.event.workflow_run.head_sha }}
          REPORT_DIR: ${{ runner.temp }}/pr-report
        run: |
          PR_NUMBER="$(tr -d '[:space:]' < "$REPORT_DIR/pr-number")"
          [[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || { echo "invalid PR number" >&2; exit 1; }
          PR_HEAD_SHA="$(gh pr view "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --json headRefOid --jq .headRefOid)"
          [[ "$PR_HEAD_SHA" == "$HEAD_SHA" ]] || { echo "PR head SHA mismatch" >&2; exit 1; }
          BODY="$(jq -r '"Build size: \(.bytes | tonumber) bytes"' "$REPORT_DIR/metrics.json")"
          gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body "$BODY"
```
