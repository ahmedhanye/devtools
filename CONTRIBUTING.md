# Contributing to DevTools

DevTools is a developer tooling monorepo providing utilities and workflows across CLI, daemon, API, and frontend interfaces.

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) 1.4.2 or higher
- [GitHub CLI (`gh`)](https://cli.github.com/) 2.60.0 or higher
- Git 2.40.0 or higher

### Local setup

1. Clone the repository:
   ```bash
   git clone https://github.com/AhmedHanye/devtools.git
   cd devtools
   ```
2. Install dependencies and set up git hooks:
   ```bash
   bun install
   ```

## Development commands

Run checks across the monorepo during development:

- **Lint and format checks:**
  ```bash
  bun run check
  ```
- **Typecheck all workspaces:**
  ```bash
  bun run typecheck
  ```
- **Run test suites:**
  ```bash
  bun run test
  ```
- **Fast local verification:**
  ```bash
  bun run verify:fast
  ```
- **Canonical local verification (on-demand):**
  ```bash
  bun run verify
  ```

## Contribution workflow

1. **Start with an issue:** Every pull request links to an open tracking issue. Create a linked working branch:
   ```bash
   gh issue develop <ticket_number> --checkout
   ```
2. **Commit changes:** Follow [Conventional Commits](https://www.conventionalcommits.org/) (`<type>(<scope>): <description>`). Types `feat:` and `fix:` trigger automated semantic releases. Keep issue references in pull request descriptions rather than commit subjects.
3. **Stage atomic changes:** Stage specific files by path and inspect staged contents:
   ```bash
   git add <path>
   git diff --cached --stat
   ```
4. **Open a pull request:**
   ```bash
   gh pr create --assignee "@me" --fill
   ```
   Follow [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) and ensure the description includes `Closes #<ticket_number>`. Inspect the linked issue and parent Spec descriptions (`gh issue view <ticket_number>` and `gh api repos/{owner}/{repo}/issues/<ticket_number>/parent`), updating any completed checklist tasks (`- [ ]` to `- [x]`) using `gh issue edit`.
5. **Resolve review comments:** Address reviewer and automated comments before merging. When pushing commits to an existing pull request, inspect open review threads, verify if the commits resolve the comments, post a comment referencing the commit SHA, and resolve the threads via GraphQL.
6. **Merge via squash merge:**
   ```bash
   gh pr merge <pr_number> --squash --delete-branch
   ```

## Documentation

Detailed operational guides live under `docs/contributing/`:

- [Pull requests and code review](docs/contributing/pull-requests.md): Review thread resolution and merge requirements.
- [Issue tracking and management](docs/contributing/issues.md): Hierarchy, sub-issues, dependencies, and project lifecycle.
- [Commits and atomic changes](docs/contributing/commits.md): Commit types, subject formats, and staging.
- [Releases and distribution](docs/contributing/releases.md): Release Please workflow and standalone binary compilation.
