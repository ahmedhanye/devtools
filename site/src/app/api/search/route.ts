import { source } from "@/lib/source";
import { buildSearchIndex } from "@/lib/docs-index";
import { createFromSource } from "fumadocs-core/search/server";

export const { GET } = createFromSource(source, {
  buildIndex: buildSearchIndex,
});
