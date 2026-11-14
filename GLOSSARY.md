# Glossary

Canonical domain vocabulary for DevTools packages and applications mapped across bounded contexts.

## Contexts

- [Runtime & CLI](./docs/glossary/runtime.md): local daemon process, runtime stack, shared core contracts, checksum manifests, host process boundary, and programmatic CLI seams.
- [Browser Automation](./docs/glossary/browser.md): Chromium resolution waterfall, managed browser cache, Chrome for Testing distribution, and explicit path or cache overrides.
- [Performance Auditing](./docs/glossary/lighthouse.md): transient daemon Audit Jobs, isolated Audit Runs, Representative Run selection, Insight Audits, warm Audit Summaries, cold Report Artifacts, Performance Budgets, and Agent Mode.
- [Persistence](./docs/glossary/persistence.md): database path resolution across environments, startup migration runner, and injectable Configuration Seams.
- [Frontend & UI](./docs/glossary/frontend.md): pages-first extraction rule, App Router boundary adapters, tear-free client hydration, semantic theme tokens, and portable stories.

## Relationships

- **Runtime & CLI to Persistence:** The local daemon and CLI commands open `@devtools/db` connections, run startup migrations, and query application state.
- **Runtime & CLI to Browser Automation:** CLI browser commands run the browser resolution waterfall and consume cached Chrome for Testing executables.
- **Performance Auditing to Browser Automation and Persistence:** `@devtools/lighthouse` resolves Chromium binaries through `@devtools/browser`, runs isolated audits, and stores structured records in `@devtools/db` alongside cold Report Artifacts on disk.
- **Frontend & UI to Runtime & CLI:** The web dashboard runs in the browser and calls daemon endpoints mounted under `/api/*`.
- **Shared Core (`@devtools/core`):** Supplies shared domain schemas, types, and error primitives across all contexts.
