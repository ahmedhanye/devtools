# Glossary

Canonical domain vocabulary for DevTools packages and applications mapped across bounded contexts.

## Contexts

| Context                                               | Canonical terms                                                                                                                  |
| :---------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| [Runtime & CLI](./docs/glossary/runtime.md)           | Daemon, Runtime Stack, Shared Core, Checksum Manifest, Host Process Boundary, Programmatic CLI Seam, Teardown                    |
| [Browser Automation](./docs/glossary/browser.md)      | Browser Resolution Waterfall, Managed Browser Cache, Chrome for Testing (CfT), Explicit Browser Override, Managed Cache Override |
| [Performance Auditing](./docs/glossary/lighthouse.md) | Audit Job, Audit Run, Representative Run, Insight Audit, Audit Summary, Report Artifact, Performance Budget, Agent Mode          |
| [Persistence](./docs/glossary/persistence.md)         | Multi-Environment Path Resolution, Lazy Schema Initialization, Database Session, Database Handle, Configuration Seam             |
| [Frontend & UI](./docs/glossary/frontend.md)          | Pages-First Extraction Rule, App Router Boundary Adapter, Tear-Free Client Hydration, Semantic Theme Tokens, Portable Story      |

## Relationships

- **Runtime & CLI to Performance Auditing and Persistence.** Application composition roots (`apps/cli` and `apps/api`) own `DbHandle` lifecycles via `@devtools/db`, pass borrowed `DbSession` instances to `@devtools/lighthouse` (`createLighthouseStore`), and run reverse-registration LIFO teardown via `@devtools/core/node` (`createTeardown`, `attachHostSignals`). Route modules and feature CLI commands stay DB-free.
- **Runtime & CLI to Browser Automation.** CLI browser commands execute the Browser Resolution Waterfall and use cached Chrome for Testing executables.
- **Performance Auditing to Browser Automation and Persistence.** `@devtools/lighthouse` resolves Chromium binaries through `@devtools/browser`, runs isolated Audit Runs, manages single-flight Audit Jobs (`AuditJobManager`), and reads or writes SQLite through borrowed `DbSession` instances alongside cold Report Artifacts on disk.
- **Frontend & UI to Runtime & CLI.** The web dashboard runs in the browser and calls Daemon endpoints mounted under `/api/*`.
- **Shared Core (`@devtools/core`).** Supplies shared domain schemas, types, and error primitives across all contexts.
