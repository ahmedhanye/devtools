# DevTools

Developer tooling monorepo providing development utilities and workflows across CLI, daemon, API, and frontend interfaces.

## Workspaces

- **`apps/cli`** (`@devtools/cli`): Command-line interface for DevTools workflows.
- **`apps/api`** (`@devtools/api`): HTTP API server powered by Hono.
- **`apps/frontend`** (`@devtools/frontend`): Web dashboard and user interface built with Next.js.
- **`packages/core`** (`@devtools/core`): Shared domain models, configuration schemas, and utilities.
- **`packages/db`** (`@devtools/db`): Database persistence schemas and migration utilities.
- **`site`** (`@devtools/site`): Documentation platform and guides built with Fumadocs.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (`1.4.2` or later)

### Setup & Verification

```bash
# Install workspace dependencies
bun install

# Run linters, type checks, and tests across all workspaces
bun run verify
```

## Documentation

Comprehensive guides, architecture overviews, tutorials, and API references are hosted on the Fumadocs documentation platform.

To run the documentation site locally:

```bash
bun --filter @devtools/site dev
```

The documentation server will be available at `http://localhost:3001`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflows, branch naming conventions, and pull request guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
