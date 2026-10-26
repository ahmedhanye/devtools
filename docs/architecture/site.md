# Documentation Site Architecture

Architecture, Fumadocs MDX content pipeline, search index generation, and LLM context endpoints for `site/`.

## Platform overview

The documentation platform lives at `site/` as `@devtools/site`. It is built with Next.js App Router and [Fumadocs](https://fumadocs.vercel.app/):

```text
site/
├── content/docs/              # Markdown & MDX documentation content across Diátaxis quadrants
├── src/
│   ├── app/
│   │   ├── docs/[[...slug]]/  # Catch-all documentation page & layout shell
│   │   ├── api/search/        # Dynamic search index endpoint
│   │   ├── llms.txt/          # Plain-text summary catalog for LLMs
│   │   └── llms-full.txt/     # Complete plain-text documentation concatenation
│   ├── components/            # UI components, layout shell, and Mermaid renderer
│   └── lib/                   # Fumadocs source loader, search indexing, and LLM utilities
└── source.config.ts           # Fumadocs MDX configuration & remark plugins
```

## Content pipeline and MDX configuration

1. **Source definition**: `site/source.config.ts` defines the documentation content directory (`content/docs`) and attaches remark plugins (e.g. `remarkMdxMermaid`).
2. **Generated collection**: `fumadocs-mdx` processes content into typed collections under `site/.source`.
3. **Loader instance**: `site/src/lib/source.ts` connects the generated source collection to Fumadocs's `loader({ baseUrl: "/docs", source })`.

## Search engine route

The route handler at `site/src/app/api/search/route.ts` serves fast client-side searches:

- Consumes `createFromSource(source, { buildIndex: buildSearchIndex })` from `fumadocs-core/search/server`.
- `buildSearchIndex` in `site/src/lib/docs-index.ts` indexes page titles, headings, URLs, and section content.

## LLM context endpoints

Two dedicated routes provide formatted plain text documentation for AI agents and language models:

- `/llms.txt`: Summary catalog of documentation pages and section titles (`site/src/app/llms.txt/route.ts`).
- `/llms-full.txt`: Complete concatenated text of all documentation content (`site/src/app/llms-full.txt/route.ts`).

Both routes consume `getLlmsIndex()` and `getLlmsFull()` from `site/src/lib/docs-llms.ts`, configured via `llms(source, { ... })` from `fumadocs-core/source`.

## Interactive diagram rendering

`site/src/components/mermaid.tsx` renders Mermaid code blocks client-side with SVG output, theme synchronization, and accessible fallback text, supporting diagrams in MDX pages without pre-rendering steps.
