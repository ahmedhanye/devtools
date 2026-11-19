# Commits and atomic changes

Guidelines for writing Conventional Commits, choosing scopes, keeping history release-safe, and staging logical atomic changes.

## Conventional commits

Commit messages and pull request titles follow the Conventional Commits specification:

```text
<type>[optional (<scope>)][optional !]: <imperative description>
```

> [!IMPORTANT]
> **Primary-intent rule (bundle tests with code).** Name each commit after the main outcome it delivers and include its matching tests (`*.test.ts`, `*.test.tsx`, `tests/**`) in the same commit so every commit stays buildable, testable, and revertible. Reserve `test:` strictly for standalone test work with no production code change (missing coverage, flaky test fixes, or test harness refactors).

### Commit types

| Type       | Triggers release | Use for                                                                                            |
| :--------- | :--------------- | :------------------------------------------------------------------------------------------------- |
| `feat`     | Minor (`0.X.0`)  | New end-user runtime capability (include matching tests).                                          |
| `fix`      | Patch (`0.0.X`)  | Runtime bug fix or security dependency patch (`fix(deps)`) (include matching tests).               |
| `perf`     | Patch (`0.0.X`)  | Runtime performance improvement (include matching tests).                                          |
| `revert`   | Patch (`0.0.X`)  | Reverts a previous runtime commit.                                                                 |
| `ci`       | No               | GitHub Actions workflows, composite actions, Dependabot, and `.coderabbit.yaml` (preferred).       |
| `chore`    | No               | Maintenance, routine dependency bumps (`chore(deps)`), internal scripts, or root config updates.   |
| `docs`     | No               | Repository documentation, ADRs, glossaries, documentation site content, and `.agents/` guidelines. |
| `style`    | No               | Formatting or cosmetic edits with zero logic impact.                                               |
| `refactor` | No               | Internal restructuring that neither fixes a bug nor adds a feature (include updated tests).        |
| `test`     | No               | Standalone test additions, missing coverage, flaky-test fixes, or test helper refactors.           |
| `build`    | No               | Build system, compiler, or bundling configuration changes.                                         |

> [!TIP]
> Prefer `ci: <description>` over `chore(ci): <description>` for CI, workflow, and reviewer configuration updates.

### Canonical scopes and release safety

Scopes are **optional** and appear as bold prefixes (`**cli:**`) in the Release Please changelog. Both local `commitlint` and CI enforce clean scope syntax (lowercase letters, numbers, hyphens, or a single `area/subarea` slash; no spaces, commas, or `(repo)`) rather than a closed hardcoded allowlist:

- **Default to workspace names.** Use canonical workspace names so changelogs stay uniform: `api`, `cli`, `frontend`, `browser`, `core`, `db`, `lighthouse`, `site`, `deps`, `scripts`, `agents`. Avoid synonyms such as `ui` or `web` (use `frontend`) or `lh` (use `lighthouse`).
- **Allow clearer domain or sub-scopes when helpful.** Use a concise subsystem or slash sub-scope (for example, `cli/audit` or `lighthouse/runner`) when it makes a changelog entry clearer to users.
- **Omit scope for cross-cutting or root work.** Leave the scope empty (`feat: ...`, `refactor: ...`, `chore: ...`, `docs: ...`, `ci: ...`) when a change spans multiple equal areas or root files. Never use `(repo)` or comma-separated scopes (`api,cli`).

> [!WARNING]
> **Release safety (`exclude-paths`).** Release Please skips a commit only when _every_ modified file falls under excluded paths (`.agents`, `.github`, `docs`, `scripts`, `site`). Never use release-triggering types (`feat`, `fix`, `perf`, `revert`) for non-runtime areas, especially when a PR also touches `package.json` or `bun.lock`, or it will trigger an accidental CLI release. Reserve `fix(deps)` strictly for security dependency patches.

### Clean commit subjects

- **Header length.** Keep local commit headers at **72 characters or fewer** and PR titles at **65 characters or fewer** (**64** at PR `#1000+`) so GitHub's ` (#NNN)` suffix stays within 72 characters on `main`.
- **Imperative mood, no trailing period, no `#123`.** Write commands to the codebase (for example, `add`, `fix`, `remove`) and track issues in PR descriptions (`Closes #123`) rather than commit subjects.
- **Breaking changes.** Mark breaking runtime changes with `!:` in the header (for example, `feat(cli)!: remove legacy --output flag`) so Release Please triggers a major bump even with empty squash commit bodies.

Examples: `feat(cli): add lighthouse audit command`, `fix(frontend): resolve layout shift on mobile viewports`, `refactor(lighthouse): extract hexagonal runner ports`, `docs: update contributing and release guides`, `ci: validate pull request titles deterministically`.

### Commit bodies

Commit bodies are **optional**. Omit the body whenever the header is self-explanatory.

Write a short 1 to 3 sentence body (separated by one blank line, wrapped around 72 characters; `commitlint` rejects lines over 100 characters unless they contain URLs) only when the **why**, constraint, or trade-off is not obvious from the header or diff. Avoid bulleted diff recaps that merely restate changed files or symbols:

```text
fix(cli): return exit code 2 on missing config path

Prevent silent fallback to default settings when the user passes an
explicit --config path that does not exist on disk.
```

## Logical atomic commits

Each commit represents **one coherent, buildable, revertible logical change**, regardless of how many folders it needs to touch:

- **Keep coupled files together.** Stage production code, its matching tests, required cross-package contract updates, and any lockfile/manifest changes that belong to the same logical change in one commit so every commit compiles and passes tests on its own.
- **Split unrelated work.** Separate unrelated refactors, bug fixes, dependency bumps, or documentation updates into distinct commits; never blindly stage a dirty tree with `git add .` or `git commit -a`.
- **Avoid mechanical micro-splitting.** Do not chop one cohesive change into per-folder or test-only micro-commits.
- **Let hooks run.** Allow [lefthook.yml](../../lefthook.yml) `pre-commit` and `commit-msg` hooks to validate staged changes automatically; never pass `--no-verify`.
