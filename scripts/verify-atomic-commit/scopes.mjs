/**
 * Shared Static Scope Taxonomy and Domain Mappings
 *
 * Single source of truth defined in docs/contributing/commits.md, consumed by:
 * - commitlint.config.mjs (for scope-enum and type-scope matrix verification)
 * - scripts/verify-atomic-commit/verify-atomic-commit.ts (for single-domain isolation and separation of concerns)
 */

export const SCOPES = {
  // Runtime packages and apps
  api: { domain: "runtime", pattern: "^apps/api/" },
  cli: { domain: "runtime", pattern: "^apps/cli/" },
  frontend: { domain: "runtime", pattern: "^apps/frontend/" },
  site: { domain: "runtime", pattern: "^site/" },
  browser: { domain: "runtime", pattern: "^packages/browser/" },
  core: { domain: "runtime", pattern: "^packages/core/" },
  db: { domain: "runtime", pattern: "^packages/db/" },
  lighthouse: { domain: "runtime", pattern: "^packages/lighthouse/" },

  // Documentation sections and related index files
  adr: { domain: "docs", pattern: "^docs/adr/" },
  architecture: {
    domain: "docs",
    pattern: "^(docs/architecture/|ARCHITECTURE\\.md$)",
  },
  standards: {
    domain: "docs",
    pattern: "^(docs/(?:coding-standards|standards)/|CODING_STANDARDS\\.md$)",
  },
  contributing: {
    domain: "docs",
    pattern: "^(docs/contributing/|CONTRIBUTING\\.md$|CODE_OF_CONDUCT\\.md$)",
  },
  glossary: { domain: "docs", pattern: "^(docs/glossary/|GLOSSARY\\.md$)" },
  testing: { domain: "docs", pattern: "^(docs/testing/|TESTING\\.md$)" },
  review: { domain: "docs", pattern: "^(docs/review/|REVIEW\\.md$)" },

  // Internal systems
  agents: { domain: "agents", pattern: "^(\\.agents/|skills-lock\\.json$)" },
  ci: { domain: "tooling", pattern: "^(\\.github/|\\.coderabbit\\.yaml$)" },
  scripts: { domain: "tooling", pattern: "^scripts/" },
  deps: {
    domain: "deps",
    pattern:
      "^(bun\\.lock$|(?:(?:apps|packages)/[^/]+|site)?/?package\\.json$)",
  },
};

export const ALLOWED_SCOPES = Object.keys(SCOPES).toSorted();

/**
 * Valid Conventional Commit types permitted for each scope.
 * Only runtime scopes may use feat / fix (with fix(deps) permitted for security patches).
 * Internal agent configurations, skills, and instructions MUST always be docs(agents).
 * Workflows under .github/ MUST always be chore(ci).
 */
export const TYPE_SCOPE_MATRIX = {
  // Runtime packages & apps
  api: ["feat", "fix", "chore", "refactor", "perf", "test", "style", "revert"],
  cli: ["feat", "fix", "chore", "refactor", "perf", "test", "style", "revert"],
  frontend: [
    "feat",
    "fix",
    "chore",
    "refactor",
    "perf",
    "test",
    "style",
    "revert",
  ],
  site: ["feat", "fix", "chore", "refactor", "perf", "test", "style", "revert"],
  browser: [
    "feat",
    "fix",
    "chore",
    "refactor",
    "perf",
    "test",
    "style",
    "revert",
  ],
  core: ["feat", "fix", "chore", "refactor", "perf", "test", "style", "revert"],
  db: ["feat", "fix", "chore", "refactor", "perf", "test", "style", "revert"],
  lighthouse: [
    "feat",
    "fix",
    "chore",
    "refactor",
    "perf",
    "test",
    "style",
    "revert",
  ],

  // Documentation sections
  adr: ["docs"],
  architecture: ["docs"],
  standards: ["docs"],
  contributing: ["docs"],
  glossary: ["docs"],
  testing: ["docs"],
  review: ["docs"],

  // Agents & Internal governance
  agents: ["docs"],

  // Tooling, CI, and Dependencies
  ci: ["chore"],
  scripts: ["chore", "refactor", "perf", "test"],
  deps: ["chore", "fix"],
};

/**
 * Valid types for unscoped commits (root configurations or general root docs).
 */
export const ALLOWED_UNSCOPED_TYPES = ["chore", "build", "docs"];
