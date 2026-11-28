# DevTools

Developer tooling monorepo providing local workflows across CLI, Daemon, HTTP API, and web dashboard interfaces.

## Workspaces

| Directory             | Package                | Responsibility                                                                                       |
| :-------------------- | :--------------------- | :--------------------------------------------------------------------------------------------------- |
| `apps/cli`            | `@devtools/cli`        | Command-line interface and local Daemon host (`devtools web`, `browser`, `lighthouse`).              |
| `apps/api`            | `@devtools/api`        | In-process Hono HTTP API mounted under `/api/*`.                                                     |
| `apps/frontend`       | `@devtools/frontend`   | Next.js web dashboard built with Feature-Sliced Design v2.1 and exported as static assets.           |
| `packages/core`       | `@devtools/core`       | Browser-safe domain schemas and error constants (`.`) plus Node/Bun host utilities (`./node`).       |
| `packages/db`         | `@devtools/db`         | Embedded SQLite (`bun:sqlite`) handle pool, Drizzle ORM schemas, and bundled baseline migrations.    |
| `packages/browser`    | `@devtools/browser`    | Chromium Browser Resolution Waterfall, Managed Browser Cache, and headless Chrome session ownership. |
| `packages/lighthouse` | `@devtools/lighthouse` | In-process Lighthouse audit engine, Representative Run selection, diffing, and 3-tier persistence.   |
| `site`                | `@devtools/site`       | Public documentation platform built with Fumadocs.                                                   |

## Quick start

### Prerequisites

- [Bun](https://bun.sh) (`1.4.2` or later)

### Setup and verification

```bash
# Install workspace dependencies and Git hooks
bun install

# Start the web dashboard (:3000) and API dev server (:4000) together
bun run dev

# Start the Fumadocs documentation site (:3001)
bun run dev:site

# Run linters, boundary checks, typechecks, architecture gates, coverage, and binary smoke checks
bun run verify
```

## Engineering documentation

| Document                                   | Read when                                                                              |
| :----------------------------------------- | :------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)         | Navigating system design, monorepo layout, subsystem internals, or ADRs (`docs/adr/`). |
| [CODING_STANDARDS.md](CODING_STANDARDS.md) | Writing TypeScript, packages, CLI commands, API routes, frontend code, or TSDoc.       |
| [TESTING.md](TESTING.md)                   | Authoring unit, integration, E2E, or Storybook tests and checking test anti-patterns.  |
| [REVIEW.md](REVIEW.md)                     | Running path-scoped verification commands, commit hooks, or Fallow baseline checks.    |
| [CONTRIBUTING.md](CONTRIBUTING.md)         | Managing issues, commits, pull requests, pushes, review replies, or releases.          |
| [GLOSSARY.md](GLOSSARY.md)                 | Checking canonical domain terms and avoided synonyms across bounded contexts.          |
| [SECURITY.md](SECURITY.md)                 | Reporting a security vulnerability or checking supported release lines.                |

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
