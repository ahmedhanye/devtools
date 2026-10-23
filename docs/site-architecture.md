# Documentation site architecture

Technical reference for the Fumadocs documentation platform under `site/`.

## Workspace overview

The site package lives at `site/` as `@devtools/site`. It runs Next.js with App Router and Fumadocs.

Key workspace commands:

- Typecheck: `bun --filter @devtools/site typecheck`
- Tests: `bun --filter @devtools/site test`
- Production build: `bun --filter @devtools/site build`

## Source definition and MDX pipeline

1. Configuration file: `site/source.config.ts`.
   Defines the documentation content directory and remark plugins:
   ```ts
   import { defineDocs, defineConfig } from "fumadocs-mdx/config";
   import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";

   export const docs = defineDocs({
     dir: "content/docs",
     docs: {
       postprocess: {
         includeProcessedMarkdown: true,
       },
     },
   });

   export default defineConfig({
     mdxOptions: {
       remarkPlugins: [remarkMdxMermaid],
     },
   });
   ```
2. Generated collection: `site/.source` is built by `fumadocs-mdx`. The loader in `site/src/lib/source.ts` connects `docs.toFumadocsSource()` to `loader` from `fumadocs-core/source`:
   ```ts
   import { docs } from "@/.source/server";
   import { loader } from "fumadocs-core/source";

   export const source = loader({
     baseUrl: "/docs",
     source: docs.toFumadocsSource(),
   });
   ```

## Search engine route

The route handler at `site/src/app/api/search/route.ts` serves search queries:

```ts
import { source } from "@/lib/source";
import { buildSearchIndex } from "@/lib/docs-index";
import { createFromSource } from "fumadocs-core/search/server";

export const { GET } = createFromSource(source, {
  buildIndex: buildSearchIndex,
});
```

`buildSearchIndex` in `site/src/lib/docs-index.ts` processes pages into structured data objects containing headings, contents, URLs, and page titles.

## LLM context endpoints

Two routes provide plain text documentation for language models:

- `/docs/llms.txt`: Summary catalog of documentation pages (`site/src/app/llms.txt/route.ts`).
- `/docs/llms-full.txt`: Full concatenations of all documentation content (`site/src/app/llms-full.txt/route.ts`).

Both routes consume `docsLlms` from `site/src/lib/docs-llms.ts`, configured via `llms(source, { ... })` from `fumadocs-core/source`.

## Docs shell and layout

1. Catch-all route: `site/src/app/docs/[[...slug]]/page.tsx` renders documentation pages via `DocsPage`, `DocsTitle`, `DocsDescription`, and `DocsBody`.
2. Layout shell: `site/src/app/docs/layout.tsx` wraps pages in `DocsLayout` from `fumadocs-ui/layouts/docs`, supplying `tree={source.pageTree}` and section navigation tabs.
3. Diagram component: `site/src/components/mermaid.tsx` renders Mermaid code blocks client-side with SVG output, theme synchronization, and accessible fallbacks.
