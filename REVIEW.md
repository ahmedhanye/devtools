# Review and verification guide

Run `bun run verify` after completing work and before opening a pull request.

## Targeted Turborepo inspection and runs

- **Inspect affected workspaces:** `bunx turbo ls --affected --output=json`
- **Run targeted tasks with structured JSON logs:** `bunx turbo run typecheck test --affected --json`
- **Check workspace package boundaries:** `bun run boundaries`

## Review checklist

- **Run extra checks when touching workflows or dependencies:**
  - `.github/**` or `**/*.sh`: `bun run lint:workflows`
  - `package.json` or `bun.lock`: `bun run audit`
- **Handle `fallow:check` baselines deliberately:**
  - **Refactor (default):** Simplify or extract logic when new or edited code triggers complexity or duplication findings, or when renaming a baselined function breaks its identity match.
  - **Prune:** After fixing existing debt tracked in `fallow-baselines/`, shrink the baseline with `bunx fallow baselines prune --health-baseline fallow-baselines/health-baseline.json --dupes-baseline fallow-baselines/dupes-baseline.json`.
  - **Expand (exceptions only):** Only when a finding is verified boilerplate or a false positive (such as declarative schemas, distinct error subclasses, or third-party primitives). Inspect with `bun run fallow:health` or `bun run fallow:dupes`, update the baseline with `--save-baseline`, and check `git diff fallow-baselines/` to verify only the intended entry changed.
- **Keep docs in sync.** After code, config, or workflow changes, check affected documentation (`*.md`, `docs/**`) and update anything that drifted.
