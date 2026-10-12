# 0002: Path-aware CI skip gates for branch ruleset preservation

## Context

DevTools executes 8 heavyweight verification jobs on every push and pull request to `main` across `.github/workflows/regression-testing.yml` and `.github/workflows/security.yml`. These jobs include Next.js static production exports, Bun standalone binary compilations for host and Darwin targets, full test suites, Steiger FSD architectural linting, Fallow dead-code scans, React Doctor regressions, TruffleHog secret scans, and CodeQL SAST analysis.

Modifying documentation (`site/**`, root `*.md`) or agent instruction files (`.agents/**`) triggers all 8 jobs, consuming runner capacity and delaying pull request feedback.

However, the repository enforces a branch ruleset (`Protect Main Branch`, ID `24154563`) on `main` with `strict_required_status_checks_policy: true` requiring 8 specific status check contexts:

1. `Lint & Format`
2. `Architecture & Health`
3. `Typecheck`
4. `Test`
5. `Build & Smoke Test`
6. `Dependency Audit & Review`
7. `Secret Detection (TruffleHog)`
8. `CodeQL SAST Analysis`

Using workflow-level `on.pull_request.paths` or `paths-ignore` causes GitHub Actions to skip workflow instantiation entirely. As documented by GitHub, skipped workflows dispatch no check runs to the Checks API, leaving required checks in a perpetual `Expected — Waiting for status to be reported` state and permanently blocking pull request merges. Furthermore, introducing a single rollup check (such as `ci-gate`) fails branch protection because rulesets are repository administrative configurations that cannot be altered via pull request commits.

## Decision

1. **Unconditional workflow triggers**:
   Keep workflow event declarations (`on.push`, `on.pull_request`) unconditional without root path filters in both `regression-testing.yml` and `security.yml`.

2. **API-driven change detection (`dorny/paths-filter`)**:
   Implement a lightweight prerequisite `changes` job using `dorny/paths-filter` pinned to an immutable commit SHA (`ceb8a2b8f2d89434be7ff52d3de7ec3738c5cc9d # v4.0.3`):
   - On `pull_request`, changesets are resolved directly via the GitHub REST API (`GET /repos/{owner}/{repo}/pulls/{number}/files`) without checking out git history, executing in ~2–3 seconds and remaining immune to shallow-clone or merge-commit anomalies.
   - On `push` to `main`, diffs evaluate against `github.event.before` using a shallow checkout (`fetch-depth: 2`).

3. **Job-level skip gates (`conclusion: skipped`)**:
   Apply job-level `if:` conditions across downstream jobs referencing filter outputs (`needs.changes.outputs.<flag> == 'true'`).
   Under GitHub branch rulesets, a job whose condition evaluates to `false` is registered and immediately completed with `conclusion: skipped`. GitHub's status check evaluator treats `skipped` as a passing check conclusion (`{success, skipped, neutral}`), satisfying ruleset checks without allocating runner VM minutes.

4. **Monorepo boundary differentiation**:
   - `lint-and-format`: Runs unconditionally on all changesets to guarantee Prettier formatting consistency across documentation, agent rules, and code (<10s runtime).
   - `architecture-and-health`: Runs when `apps/**` or `packages/**` change; skips on documentation and agent changes.
   - `typecheck` & `test`: Run when `apps/**`, `packages/**`, or the Fumadocs documentation platform (`site/**`) change; skip on pure `.agents/**` or `*.md` changes.
   - `build` (`Build & Smoke Test`): Skips Next.js production export and Bun standalone CLI binary compilation on `.agents/**`, `site/**`, or `*.md` changes.
   - `dependency-audit`: Skips when dependency manifests and lockfiles are untouched.
   - `secret-scanning` (TruffleHog): Runs unconditionally on every pull request to detect accidental credential leaks in documentation and agent prompt files.
   - `codeql`: Bypasses on pull requests that alter only `.agents/**`, `site/**`, or `*.md`, relying on weekly Monday scheduled scans and code PR scans.

## Consequences

- Documentation and agent changesets bypass heavyweight Next.js exports, Bun standalone binary compilations, and CodeQL SAST scans, saving up to 80% of CI runner minutes on non-code changes.
- All 8 required status check contexts mandated by repository ruleset `Protect Main Branch` report passing states (`conclusion: skipped`), eliminating merge stalls.
- Secret scanning coverage remains comprehensive across all pull requests regardless of file paths.
- Workflow triggers and job definitions remain declarative, auditable, and compliant with `.agents/skills/github-actions/` supply-chain hardening standards.
