# Commits and atomic changes

Guidelines for writing Conventional Commits, clean commit subjects, and staging atomic changesets.

## Conventional commits

Commit messages follow the Conventional Commits specification:

```text
<type>(<scope>): <imperative description>
```

> [!IMPORTANT]
> **Type isolation.** Every commit represents exactly one type of work. Never combine distinct types in a single commit. For example, test suites and test helpers (`*.test.ts`, `*.test.tsx`, or files under `tests/`) belong strictly to the `test` commit type (`test(<scope>): ...`), and must never be committed alongside `feat`, `fix`, `chore`, or `refactor` changes.

### Commit types

- `feat`: Adds a new feature or user-facing capability (runtime scopes only; excludes test files).
- `fix`: Patches a bug or defect (runtime scopes and security dependency patches only; excludes test files).
- `chore`: Maintenance, dependencies, toolchain, or internal automation updates (`chore(ci)`, `chore(scripts)`, `chore(deps)`, or root `chore:`; excludes test files).
- `docs`: Documentation changes, architectural records, and agent instructions or rules (`docs(agents)`).
- `style`: Formatting or cosmetic changes with zero logic impact.
- `refactor`: Code change that neither fixes a bug nor adds a feature (excludes test files).
- `perf`: Performance improvement (excludes test files).
- `test`: Adding or refactoring test suites (all `*.test.ts`, `*.test.tsx`, and `tests/**` files belong strictly to this type).
- `build`: Changes affecting the build system or root bundling configuration.
- `revert`: Reverts a previous commit.

> [!NOTE]
> `ci` is a scope, not a commit type. CI workflow and GitHub action updates must always use `chore(ci): <description>`.

### Scope taxonomy and type-scope matrix

Use single-noun lowercase scopes that map to physical repository directories. Never combine or comma-separate scopes:

| Domain                      | Scopes                                                                              | Allowed types                                                         | Rules                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime packages & apps** | `api`, `cli`, `frontend`, `site`, `browser`, `core`, `db`, `lighthouse`             | `feat`, `fix`, `chore`, `refactor`, `perf`, `test`, `style`, `revert` | Modifying user-facing apps or runtime libraries. `feat` and `fix` trigger automated releases via Release Please. Scope is required for `feat` and `fix`. Test files must use `test(<scope>)`. |
| **Documentation**           | `adr`, `architecture`, `standards`, `contributing`, `glossary`, `testing`, `review` | `docs`                                                                | Documentation sections under `docs/<scope>/` and their corresponding root index documents.                                                                                                    |
| **Agents & governance**     | `agents`                                                                            | `docs`                                                                | Everything under `.agents/` (skills, rules, prompts, instructions, internal skill scripts) and `skills-lock.json`. Always use `docs(agents)`.                                                 |
| **Continuous integration**  | `ci`                                                                                | `chore`                                                               | Workflows and actions under `.github/` and `.coderabbit.yaml`. Always use `chore(ci)`.                                                                                                        |
| **Internal scripts**        | `scripts`                                                                           | `chore`, `refactor`, `perf`, `test`                                   | Development utilities under `scripts/`. Never use `feat` or `fix` to prevent accidental production releases.                                                                                  |
| **Dependencies**            | `deps`                                                                              | `chore`, `fix`                                                        | Dependency version bumps (`bun.lock` and workspace manifests). `fix(deps)` is reserved for security vulnerability fixes.                                                                      |
| **Root configurations**     | _(none)_                                                                            | `chore`, `build`, `docs`                                              | Root configurations (`bunfig.toml`, `lefthook.yml`, etc.) and general root markdown files omit the scope entirely (for example, `chore: bump toolchain`). Do not use `(repo)`.                |

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
- **Strict test isolation.** All test files (`*.test.ts`, `*.test.tsx`, or files under `tests/`) must be committed separately under the `test` commit type (for example, `test(<scope>): ...`). Never mix test files into `feat`, `fix`, `chore`, or `refactor` commits.
- **Revertability.** A change that may need to be rolled back on its own belongs in its own commit.
- **Separation of concerns.** Keep unrelated tasks apart. Separate refactoring from behavior changes, vendor and lockfile updates from feature code, and documentation from tooling rules.
- **Hook enforcement.** Pre-commit and commit-msg hooks in `lefthook.yml` run formatting, linting, secret detection, commit message grammar, and atomic boundary verification on every `git commit`. Do not bypass hooks with `--no-verify`.
