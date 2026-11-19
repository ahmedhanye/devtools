# Glossary

Canonical domain vocabulary for DevTools packages and applications mapped across bounded contexts.

## Contexts

| Context                                               | Canonical terms                                                                                                                  |
| :---------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| [Runtime & CLI](./docs/glossary/runtime.md)           | Daemon, Runtime Stack, Shared Core, Checksum Manifest, Host Process Boundary, Programmatic CLI Seam, Shutdown Coordinator        |
| [Browser Automation](./docs/glossary/browser.md)      | Browser Resolution Waterfall, Managed Browser Cache, Chrome for Testing (CfT), Explicit Browser Override, Managed Cache Override |
| [Performance Auditing](./docs/glossary/lighthouse.md) | Audit Job, Audit Run, Representative Run, Insight Audit, Audit Summary, Report Artifact, Performance Budget, Agent Mode          |
| [Persistence](./docs/glossary/persistence.md)         | Multi-Environment Path Resolution, Lazy Schema Initialization, Database Handle Pool, Configuration Seam                          |
| [Frontend & UI](./docs/glossary/frontend.md)          | Pages-First Extraction Rule, App Router Boundary Adapter, Tear-Free Client Hydration, Semantic Theme Tokens, Portable Story      |

## Relationships

- **Runtime & CLI to Performance Auditing and Persistence.** The Daemon and CLI commands consume `@devtools/lighthouse` (`openLighthouseStore`) and coordinate 3-phase teardown (`ingress` -> `work` -> `persistence`) via `@devtools/core/node` (`ShutdownCoordinator`, `attachHostSignals`) without importing `@devtools/db` directly.
- **Runtime & CLI to Browser Automation.** CLI browser commands execute the Browser Resolution Waterfall and use cached Chrome for Testing executables.
- **Performance Auditing to Browser Automation and Persistence.** `@devtools/lighthouse` resolves Chromium binaries through `@devtools/browser`, runs isolated Audit Runs, and encapsulates SQLite transactions inside `@devtools/db` (`openDb`) alongside cold Report Artifacts on disk.
- **Frontend & UI to Runtime & CLI.** The web dashboard runs in the browser and calls Daemon endpoints mounted under `/api/*`.
- **Shared Core (`@devtools/core`).** Supplies shared domain schemas, types, and error primitives across all contexts.
