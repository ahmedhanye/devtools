# Commits and atomic changes

Guidelines for writing Conventional Commits, clean commit subjects, and staging atomic changesets.

## Conventional commits

Commit messages follow the Conventional Commits specification:

```text
<type>(<scope>): <imperative description>
```

### Commit types

- `feat`: Adds a new feature or user-facing capability.
- `fix`: Patches a bug or defect.
- `chore`: Maintenance, dependencies, or toolchain updates.
- `docs`: Documentation changes only.
- `style`: Formatting or cosmetic changes with zero logic impact.
- `refactor`: Code change that neither fixes a bug nor adds a feature.
- `perf`: Performance improvement.
- `test`: Adding or refactoring test suites.
- `build`: Changes affecting the build system or internal dependencies.
- `ci`: Changes to CI/CD workflows and automation scripts.
- `revert`: Reverts a previous commit.

### Static scope taxonomy

Use single-noun lowercase scopes that map to physical repository directories:

- **Runtime packages and apps:** `api`, `cli`, `frontend`, `site`, `browser`, `core`, `db`, `lighthouse`.
- **Documentation sections (`docs/<scope>/**` and related index):** `adr`, `architecture`, `standards`, `contributing`, `glossary`, `testing`.
- **Internal systems:** `agents`, `ci` (`.github/**`), `scripts` (`scripts/**`), `deps` (dependency updates).
- **Root configurations and cross-cutting maintenance:** Omit the scope entirely (`chore: ...`, `docs: ...`, `build: ...`). Do **not** use `(repo)` as a scope.

### Clean commit subjects

Keep commit subjects focused on the change by placing issue references (such as `Closes #123`) in pull request descriptions. Commitlint rules reject issue references in commit subjects to keep git logs concise.

Examples:

- `feat(cli): add initial health check command`
- `fix(frontend): resolve layout shift on mobile viewports`
- `docs: update repository quickstart and setup guide`
- `chore: bump root toolchain dependencies`
- `chore(ci): update workflow actions`

## Atomic commits

Every branch commit represents a single logical domain change. Never mix documentation, internal rules, and runtime code into one commit. Never stage an entire dirty working tree with `git add .` or `git commit -a`.

### Dividing changes

When work touches multiple directories or concerns, divide changes into separate atomic commits before pushing:

- **Single-domain isolation.** Stage only files belonging to the mapped scope of the commit. For instance, stage `packages/core/**` under `feat(core): ...`, and stage related `docs/**` in a separate `docs(architecture): ...` commit.
- **Revertability.** A change that may need to be rolled back on its own belongs in its own commit.
- **Separation of concerns.** Keep unrelated tasks apart. Separate refactoring from behavior changes, vendor and lockfile updates from feature code, and documentation from tooling rules.
- **Code and tests together.** Commit source changes and their tests in the same commit. This preserves `git bisect` and prevents untested intermediate revisions.
- **Hook enforcement.** Pre-commit hooks in `lefthook.yml` run formatting, linting, secret detection, and commit message checks on every `git commit`. Do not bypass hooks with `--no-verify`.
