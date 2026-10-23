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
- `test`: Adding or refactoring test suites.
- `refactor`: Code change that neither fixes a bug nor adds a feature.
- `style`: Formatting or cosmetic changes with zero logic impact.

### Clean commit subjects

Keep commit subjects focused on the change by placing issue references (such as `Closes #123`) in pull request descriptions. Commitlint rules reject issue references in commit subjects to keep git logs concise.

Examples:

- `feat(cli): add initial health check command`
- `fix(frontend): resolve layout shift on mobile viewports`
- `chore(ci): update workflow dependencies`

## Atomic commits

Every commit represents a single logical change scoped to a workspace (`<type>(<scope>): <desc>`). Stage files selectively by path rather than staging the entire repository. Verify staged contents before committing:

```bash
git add <path>
git diff --cached --stat
```
