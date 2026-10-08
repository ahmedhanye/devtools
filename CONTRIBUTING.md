# Contributing to DevTools

## Development workflow

Development follows an issue-first, vertical slice workflow:

1. Every change begins with an issue. Ensure every pull request links to an existing tracking issue.
2. One ticket, one vertical slice. Deliver end-to-end functionality across schema, logic, UI, and tests in a single session.
3. Deliver all code to `main` through reviewed pull requests.

## Branching

Create linked branches directly from issues:

```bash
gh issue develop <ticket_number> --checkout
```

This creates and checks out `<ticket_number>-<title-slug>` and links it to the issue in GitHub.

## Commits, releases, and pull requests

### Commit format and automated releases

Follow Conventional Commits:

```text
<type>(<scope>): <imperative description>
```

Commit types drive automated release generation via Google Release Please:

- `fix:` triggers a patch release (`v0.0.X`).
- `feat:` triggers a minor release (`v0.X.0`).
- `feat!:` or `BREAKING CHANGE:` triggers a major release (`vX.0.0`).
- `chore:`, `docs:`, `test:`, `refactor:`, `style:` do not trigger automated version bumps unless accompanied by breaking changes.

Release Please automatically maintains an open Release PR (`chore(main): release vX.Y.Z`). When merged into `main`, GitHub Actions automatically:

1. Tags the release in Git.
2. Compiles standalone native binaries across target architectures (`devtools-linux-x64`, `devtools-linux-arm64`, `devtools-darwin-x64`, `devtools-darwin-arm64`).
3. Generates cryptographic SHA256 checksums (`SHA256SUMS.txt`).
4. Attaches the binaries and checksums directly to the GitHub Release.

Keep commit subjects clean by reserving issue references (for example, `Closes #123`) for pull request descriptions. This avoids issue timeline clutter and preserves clean linear commit subjects.

Examples:

- `feat(server): add initial health check endpoint`
- `fix(web): resolve layout shift on mobile viewports`
- `chore(ci): update workflow dependencies`

### Pull request rules

1. **Link the tracking issue:** `gh issue develop` links the issue automatically. If created manually, add `Closes #<issue>` to the pull request body.
2. **Self-assign the pull request:** Always self-assign as the Directly Responsible Individual (DRI) when opening a pull request (maintainer review is automatically requested via CODEOWNERS):
   ```bash
   gh pr create --assignee "@me"
   ```
3. **Follow the pull request structure:** PR descriptions must describe user-facing changes to `main` following `.github/PULL_REQUEST_TEMPLATE.md` (Summary with structural diff/tree, Evidence, and Merge Danger). Pull request descriptions cite permanent codebase paths and omit ephemeral workspace `tmp/` paths, raw session logs, and agent execution notes.
4. **Provide verification evidence:** Include terminal test output, commands, or observable behavior confirming all acceptance criteria.
5. **Open the pull request and update status:** Run `gh pr create`, then update the tracking issue to `In Review` on the project board via `gh project item-edit`.
6. **Review thread resolution:** Repository ruleset `#24154563` (`Protect Main Branch`) enforces `required_review_thread_resolution: true`. All comment threads opened by reviewers or automated review bots (such as CodeRabbit) must be addressed before merge eligibility:
   - _Valid defect:_ Implement the code fix, confirm test passes, post a comment referencing the fix commit, and resolve the thread via GitHub GraphQL:
     ```bash
     gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread_node_id>"}) { clientMutationId } }'
     ```
   - _False positive / Hallucination:_ Post a technical comment detailing why the remark is invalid or contradicts repo design, and resolve the thread via GraphQL.
   - _Ambiguous or high-risk finding:_ Leave the thread unresolved, apply the `needs-human-review` label, and escalate.
7. **Squash merge into `main` after review passes:** `gh pr merge <pr_number> --squash --delete-branch`. Linear history with squash merging is enforced by repository rulesets.

## Verification and quality standards

All changes must pass local and CI verification before merging:

### Local verification gate

Run the canonical local gate before pushing:

```bash
bun run verify
```

This command runs the complete quality suite:

1. `check`: Prettier formatting verification and Oxlint static analysis.
2. `lint:design`: Frontend design token constraints.
3. `lint:fsd`: Steiger architectural Feature-Sliced Design boundary checks.
4. `typecheck`: TypeScript compiler type checks (`tsc --noEmit`) across all workspaces.
5. `test`: Vitest and Bun test suites across all packages.

**Workflow and action changes exemption:** Pull requests modifying exclusively `.github/workflows/**` or `.github/actions/**` are exempt from full monorepo test suites and require only targeted workflow validation before pushing:

```bash
bunx prettier --check .github/workflows/** .github/actions/**
bun scripts/verify-staged-secrets.ts .github/workflows/** .github/actions/**
```

Follow `.agents/rules/verification.md` for proportionate change-scoped checks during iterative development.

### Code style and autofix

- Format code: `bun run format`
- Fix lint errors: `bun run lint:fix`

### Pre-commit hooks

[Lefthook](https://github.com/evilmartians/lefthook) runs fast pre-commit hooks on staged files. Run git hooks on every commit; bypass hooks (`--no-verify`) strictly during maintainer-approved emergencies.

## Supply chain security and contributor boundaries

Contributors and automated agents observe these security and contribution boundaries:

1. **Frozen lockfile enforcement:**
   Always install dependencies using `bun install --frozen-lockfile`. Unintended modifications to `bun.lock` fail CI immediately. Adding or updating dependencies requires explicit rationale and intentional lockfile commits.

2. **Zero phantom dependencies:**
   Every package imported in a workspace (`apps/*`, `packages/*`) must be explicitly declared in that workspace's local `package.json`. Undeclared dependencies fail Fallow architectural boundary analysis.

3. **Fork security boundary:**
   Protected workflows (`.github/workflows/`), agent configurations (`.agents/`), and toolchain configurations (`bunfig.toml`, `lefthook.yml`, `package.json`) are guarded by GitHub Branch Rulesets and mandatory Code Owner review (`@AhmedHanye`). External pull requests modifying these protected boundaries cannot be merged without explicit maintainer approval.

4. **Issue operations:**
   Follow `.agents/docs/issue-tracker.md` for ticket claiming, dependency management, and project board status updates.
   - Check off completed acceptance criteria (`- [x]`).
   - Post technical discoveries and blocker alerts as issue comments.
   - Preserve existing issue descriptions, problem statements, and acceptance criteria.

5. **Escalation:**
   When requirements are ambiguous or tests fail repeatedly, apply `needs-human-review`, post a blocker summary, and yield execution to the maintainer.
