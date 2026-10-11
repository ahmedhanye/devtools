import { describe, expect, it } from "bun:test";
import { source } from "../src/lib/source";

describe("documentation source loader", () => {
  it("loads documentation pages conforming to page schema", () => {
    const pages = source.getPages();
    expect(Array.isArray(pages)).toBe(true);
    expect(pages.length).toBeGreaterThan(0);

    for (const page of pages) {
      expect(typeof page.url).toBe("string");
      expect(Array.isArray(page.slugs)).toBe(true);
      expect(page.data).toBeDefined();
    }
  });

  it("resolves pages by slug and by url through source query functions", () => {
    const pages = source.getPages();
    const samplePage = pages[0];

    const bySlug = source.getPage(samplePage.slugs);
    expect(bySlug).toBeDefined();
    expect(bySlug?.url).toBe(samplePage.url);

    const byUrl = source.getPageByUrl(samplePage.url);
    expect(byUrl).toBeDefined();
    expect(byUrl?.url).toBe(samplePage.url);
  });

  it("returns undefined when querying non-existent page slugs", () => {
    const missing = source.getPage(["non-existent-page-slug-xyz"]);
    expect(missing).toBeUndefined();
  });

  it("builds pageTree navigation hierarchy with valid node contracts", () => {
    const tree = source.pageTree;
    expect(tree).toBeDefined();
    expect(Array.isArray(tree.children)).toBe(true);

    for (const node of tree.children) {
      expect(node.type).toBeDefined();
      if (node.type === "folder") {
        expect(Array.isArray(node.children)).toBe(true);
      }
    }
  });
});
