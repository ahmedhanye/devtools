---
name: evaluate-pr
description: Evaluate whether a pull request should be merged or investigated based on CI checks, review threads, blast radius, and repository standards.
disable-model-invocation: true
---

# Evaluate pull request

Evaluate a pull request to determine whether it is ready to squash merge into `main` or requires further investigation.

Run this skill when invoked with `/evaluate-pr` followed by a pull request number or URL.

## Operational constraints

1. **Read-only evaluation.** Perform evaluations strictly in read-only mode without modifying files, staging commits, running code edits, or executing GraphQL mutations.
2. **Remote ref queries.** Inspect remote pull request state directly using `gh` CLI queries and read-only git queries against fetched refs without switching local branches.

## Evaluation workflow

### 1. Resolve pull request and extract metadata

Identify the pull request target from the input argument (for example, `123` or the full pull request URL). Extract all pull request metadata, commits, and check runs in a single query:

```bash
PR_TARGET="123"
gh pr view "$PR_TARGET" --json number,title,author,headRefName,baseRefName,body,labels,isDraft,state,url,commits,statusCheckRollup
PR_NUMBER=$(gh pr view "$PR_TARGET" --json number -q .number)
```

When calling `run_command` in automated tools, set `WaitMsBeforeAsync` to `10000` so remote GitHub API queries return synchronously.

Verify that the pull request is open and not in draft status. If closed or draft, record this status directly in the evaluation report.

### 2. Inspect remote CI checks and failure logs

Inspect the status of automated CI checks from `statusCheckRollup`. Run `gh pr checks "$PR_TARGET"` for a compact summary.

If any check is failing or cancelled:
1. Locate the failing check run in `statusCheckRollup`. The `detailsUrl` contains the GitHub Actions run and job ID (for example, `.../job/112992600088`).
2. Fetch the failure log directly from the GitHub API:

```bash
gh api /repos/:owner/:repo/actions/jobs/<JOB_ID>/logs | grep -E -C 3 "(error TS|Error:|FAILED|##\[error\])"
```

Alternatively, query check annotations using the check-run ID (which matches `<JOB_ID>` for GitHub Actions jobs):

```bash
gh api /repos/:owner/:repo/check-runs/<CHECK_RUN_ID>/annotations
```

Summarize the failure reason concisely under findings.

### 3. Check review thread resolution

Repository ruleset `#24154563` (`Protect Main Branch`) enforces `required_review_thread_resolution: true`. Query the GitHub GraphQL API to verify that all comment threads from human reviewers and review bots (such as CodeRabbit) are marked resolved:

```bash
gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes {
              body
              author { login }
            }
          }
        }
      }
    }
  }
}' -F owner=':owner' -F repo=':repo' -F pr="$PR_NUMBER"
```

Identify any threads where `isResolved` is false. Extract the comment author and the open concern.

### 4. Analyze diff blast radius and architectural boundaries

Inspect the modified files:

```bash
gh pr diff "$PR_TARGET" --name-only
gh pr diff "$PR_TARGET"
```

Evaluate the diff against repository standards using progressive disclosure:
- **Blast radius:** Map modified paths across workspaces (`apps/*`, `packages/*`, `.github/*`, `.agents/*`, scripts).
- **Workspace dependency boundaries:** If changes modify `package.json` or `bun.lock`, verify compliance with `.agents/rules/dependencies.md`. Ensure no phantom dependencies resolve through hoisting and application runtime packages remain in leaf workspaces.
- **Frontend architectural boundaries:** If `apps/frontend/` is modified, verify compliance with `.agents/rules/frontend.md` (Feature-Sliced Design layers, index exports, semantic theme tokens, and safe hydration).
- **Secret leak prevention:** If changes introduce configuration keys, synthetic credentials, or fixtures, verify compliance with `.agents/rules/secrets.md` with appropriate `# trufflehog:ignore` or `// trufflehog:ignore` comments.
- **Cleanliness:** Confirm zero ephemeral files, scratch logs, or workspace `tmp/` paths are checked into git or referenced in the pull request description.

### 5. Validate PR template, evidence, and commits

1. **Pull request description:**
   - **Automated bot authors:** For bot authors (such as `dependabot[bot]` or `renovate[bot]`), waive human template verification from `.github/PULL_REQUEST_TEMPLATE.md`. Evaluate bot pull requests based on dependency placement rules ([`.agents/rules/dependencies.md`](.agents/rules/dependencies.md)), semver blast radius, and passing CI checks.
   - **Human authors:** Verify that the body follows `.github/PULL_REQUEST_TEMPLATE.md`:
     - Summary includes a structural view (shallow file tree, component tree, or diff sketch).
     - Closing issue link is present (`Closes #123`).
     - Observable verification evidence is included (terminal output, test passes, or visual proof).
     - Merge Danger section specifies Door type (`one-way` or `two-way`) and Blast Radius.
2. **Commit conventions:** Verify commit messages match Conventional Commits (`type(scope): description`) without issue references in commit subjects.

## Output format

Generate an executive evaluation report following this structure:

```markdown
# Pull request evaluation: #{number} - {title}

**Author:** @{author} | **Branch:** `{head_branch}` to `{base_branch}` | **URL:** {pr_url}

## 1. Metadata and blast radius
- **Door:** {one-way or two-way}
- **Blast radius:** {scope description}
- **Modified workspaces:** {list of impacted apps/packages/infra}

## 2. What looks good
- {List passed CI checks, clean boundaries, and satisfied standards}

## 3. What needs attention
- {List failing checks with log snippets, unresolved review threads, missing evidence, or standards violations. If clean, state "No blockers or defects identified."}

## 4. Manual verification checklist
- {List required manual checks or visual inspections. If none required, state "No manual verification required. Automated CI evidence is complete."}

## 5. Evaluation verdict
**Verdict:** MERGE
(or)
**Verdict:** INVESTIGATE
```

## Verdict determination

- **MERGE:** Assign when all conditions pass: CI status check rollup is completely green, all review threads are resolved (`isResolved: true`), architectural boundaries and secret rules are satisfied, and template evidence is complete (or waived for bots).
- **INVESTIGATE:** Assign if any check fails or is cancelled, review threads remain open, required template evidence is missing, boundary invariants are violated, or manual verification is required.
