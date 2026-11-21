# Contributing to DevTools

Setup instructions, development lifecycle, and operational guides for contributing to the DevTools monorepo.

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) `1.4.2` or higher
- [GitHub CLI (`gh`)](https://cli.github.com/) `2.46.0` or higher (`2.94.0+` adds native `--parent` and `--blocked-by`; guides below include `gh api` fallbacks)
- Git `2.40.0` or higher

### Local setup

```bash
git clone https://github.com/AhmedHanye/devtools.git
cd devtools
bun install
```

## Verification workflow

Follow [Review and verification guide](REVIEW.md) to run narrow, path-scoped checks during edits and the matching completion gate (or `bun run verify` for root or multi-workspace changes) before opening a pull request.

## Contribution lifecycle

1. **Start from a tracking issue.** Claim an open ticket and check out its linked branch per [Issue tracking and management](docs/contributing/issues.md).
2. **Stage and commit logical changes.** Stage files by path and write Conventional Commits following [Commits](docs/contributing/commits.md). Keep issue references out of commit subjects.
3. **Verify and push.** Run the path-scoped completion check in [REVIEW.md](REVIEW.md#scope-and-verification-matrix), push commits, and handle post-push review replies per [Pushing changes and review synchronization](docs/contributing/push.md).
4. **Open, review, and merge the pull request.** Follow [Pull requests](docs/contributing/pull-request.md) for title, template, label, evidence, single-PR, and stacked-PR rules. Squash merge only once all required checks pass and reviewers resolve all threads.

## Contributing guides

| Guide                                                                   | Read when                                                                                             |
| :---------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| [Issue tracking and management](docs/contributing/issues.md)            | Creating Specs or Tickets, claiming work, linking sub-issues, or updating project board statuses.     |
| [Commits](docs/contributing/commits.md)                                 | Choosing commit types and scopes, formatting headers or bodies, or splitting logical changes.         |
| [Pull requests](docs/contributing/pull-request.md)                      | Opening, updating, stacking, or merging pull requests (routes to single-PR, stacked-PR, and replies). |
| [Pull request comments](docs/contributing/pull-request/comments.md)     | Inspecting, classifying, and replying to unresolved pull request review threads.                      |
| [Pushing changes and review synchronization](docs/contributing/push.md) | Running pre-push gates, pushing branches or stacks, inspecting active PRs, and replying to reviews.   |
| [Releases and distribution](docs/contributing/releases.md)              | Understanding Release Please triggers, version bumps, and standalone binary release artifacts.        |
