import { defineDocs, defineConfig } from "fumadocs-mdx/config";
import { remarkMdxMermaid, remarkNpm } from "fumadocs-core/mdx-plugins";

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
    remarkPlugins: [
      remarkMdxMermaid,
      [remarkNpm, { persist: { id: "package-manager" } }],
    ],
  },
});
