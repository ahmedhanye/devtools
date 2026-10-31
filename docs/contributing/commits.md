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

### Clean commit subjects

Keep commit subjects focused on the change by placing issue references (such as `Closes #123`) in pull request descriptions. Commitlint rules reject issue references in commit subjects to keep git logs concise.

Examples:

- `feat(cli): add initial health check command`
- `fix(frontend): resolve layout shift on mobile viewports`
- `chore(ci): update workflow dependencies`

## Atomic commits

Every commit represents a single logical change. If a commit description needs "and" to explain what it does, split the commit. Never stage an entire dirty working tree with `git add .` or `git commit -a`.

### Dividing changes

When a session leaves changes across multiple files or directories, divide them into separate commits before pushing:

- **Revertability.** A change that may need to be rolled back on its own belongs in its own commit.
- **Separation of concerns.** Keep unrelated tasks apart. Separate refactoring from behavior changes, vendor and lockfile updates from feature code, and documentation from tooling rules.
- **Code and tests together.** Commit source changes and their tests in the same commit. This preserves `git bisect` and prevents untested intermediate revisions.
- **Hook enforcement.** Pre-commit hooks in `lefthook.yml` run formatting, linting, secret detection, and commit message checks on every `git commit`. Do not bypass hooks with `--no-verify`.
