import { describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "fumadocs-core/source";
import { buildSearchIndex, resolvePageDetails } from "../src/lib/docs-index";

describe("resolvePageDetails path confinement (Unit)", () => {
  it("reads markdown metadata from confined files and rejects traversals, sibling prefixes, symlinks, and directories", () => {
    const tempBase = mkdtempSync(path.join(tmpdir(), "devtools-docs-index-"));
    const docsRoot = path.join(tempBase, "content", "docs");
    const siblingDir = path.join(tempBase, "content", "docs-secret");
    const subDir = path.join(docsRoot, "nested");
    const validDoc = path.join(docsRoot, "intro.mdx");
    const outsideDoc = path.join(tempBase, "secret.mdx");
    const siblingDoc = path.join(siblingDir, "leak.mdx");
    const symlinkDoc = path.join(docsRoot, "symlink-escape.mdx");

    mkdirSync(subDir, { recursive: true });
    mkdirSync(siblingDir, { recursive: true });
    writeFileSync(
      validDoc,
      "---\ntitle: Confined Intro\ndescription: Safe doc\n---\nBody",
    );
    writeFileSync(outsideDoc, "---\ntitle: SECRET_OUTSIDE\n---\nLeak");
    writeFileSync(siblingDoc, "---\ntitle: SIBLING_SECRET\n---\nLeak");
    symlinkSync(outsideDoc, symlinkDoc);

    try {
      const validInfoPage = {
        path: "intro.mdx",
        data: { info: { fullPath: validDoc } },
      } as unknown as Page;
      expect(resolvePageDetails(validInfoPage, { docsRoot })).toEqual({
        title: "Confined Intro",
        description: "Safe doc",
        content: "Body",
      });

      const validBodyPage = {
        path: "intro.mdx",
        data: { body: validDoc },
      } as unknown as Page;
      expect(resolvePageDetails(validBodyPage, { docsRoot }).title).toBe(
        "Confined Intro",
      );

      const traversedBodyPage = {
        path: "intro.mdx",
        data: { body: outsideDoc },
      } as unknown as Page;
      expect(resolvePageDetails(traversedBodyPage, { docsRoot }).title).toBe(
        "DevTools Documentation",
      );

      const siblingPrefixPage = {
        path: "../docs-secret/leak.mdx",
        data: { info: { fullPath: siblingDoc } },
      } as unknown as Page;
      expect(resolvePageDetails(siblingPrefixPage, { docsRoot }).title).toBe(
        "DevTools Documentation",
      );

      const symlinkEscapePage = {
        path: "symlink-escape.mdx",
        data: { info: { fullPath: symlinkDoc } },
      } as unknown as Page;
      expect(resolvePageDetails(symlinkEscapePage, { docsRoot }).title).toBe(
        "DevTools Documentation",
      );

      const directoryPage = {
        path: "nested",
        data: { info: { fullPath: subDir } },
      } as unknown as Page;
      expect(resolvePageDetails(directoryPage, { docsRoot }).title).toBe(
        "DevTools Documentation",
      );

      const missingPage = {
        path: "does-not-exist-xyz.mdx",
        data: { info: { fullPath: "does-not-exist-xyz.mdx" } },
      } as unknown as Page;
      expect(resolvePageDetails(missingPage).title).toBe(
        "DevTools Documentation",
      );
    } finally {
      rmSync(tempBase, { recursive: true, force: true });
    }
  });

  it("extracts structuredData from eager functions, async load(), and fallback metadata", async () => {
    const sampleStructuredData = {
      headings: [{ id: "intro", content: "Intro" }],
      contents: [{ heading: "intro", content: "Loaded section" }],
    };

    const fnDataPage = {
      url: "/docs/fn",
      path: "fn.mdx",
      data: {
        title: "Function StructuredData",
        structuredData: async () => sampleStructuredData,
      },
    } as unknown as Page;
    const fnIndex = await buildSearchIndex(fnDataPage);
    expect(fnIndex.structuredData).toEqual(sampleStructuredData);

    const lazyLoadedPage = {
      url: "/docs/lazy",
      path: "lazy.mdx",
      data: {
        title: "Lazy Page",
        load: async () => ({ structuredData: sampleStructuredData }),
      },
    } as unknown as Page;
    const lazyIndex = await buildSearchIndex(lazyLoadedPage);
    expect(lazyIndex.structuredData).toEqual(sampleStructuredData);

    const fallbackPage = {
      url: "/docs/fallback",
      path: "fallback.mdx",
      data: {
        title: "Fallback Page",
        description: "Summary fallback",
        load: async () => ({ structuredData: null }),
      },
    } as unknown as Page;
    const fallbackIndex = await buildSearchIndex(fallbackPage);
    expect(fallbackIndex.structuredData.headings).toEqual([
      { id: "overview", content: "Fallback Page" },
    ]);
    expect(fallbackIndex.structuredData.contents[0]?.content).toBe(
      "Summary fallback",
    );
  });
});
