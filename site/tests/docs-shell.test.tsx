import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  usePathname: () => "/docs",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useParams: () => ({ slug: [] }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { RootProvider } from "fumadocs-ui/provider/next";
import RootDocsLayout from "../src/app/docs/layout";
import DocsCatchAllPage, {
  generateMetadata,
  generateStaticParams,
} from "../src/app/docs/[[...slug]]/page";

describe("documentation shell and catch-all route seam", () => {
  it("generates static route parameters conforming to next.js catch-all schema", async () => {
    const params = await generateStaticParams();
    expect(Array.isArray(params)).toBe(true);
    expect(params.length).toBeGreaterThan(0);
    for (const param of params) {
      expect(Array.isArray(param.slug)).toBe(true);
    }
  });

  it("generates metadata for valid page slugs and returns fallback on non-existent slugs", async () => {
    const validMeta = await generateMetadata({
      params: Promise.resolve({ slug: [] }),
    });
    expect(typeof validMeta.title).toBe("string");

    const fallbackMeta = await generateMetadata({
      params: Promise.resolve({ slug: ["non-existent-page-xyz"] }),
    });
    expect(fallbackMeta.title).toBe("Not Found");
  });

  it("throws notFound error boundary when resolving non-existent page slug", async () => {
    let errorThrown = false;
    try {
      await DocsCatchAllPage({
        params: Promise.resolve({ slug: ["non-existent-page-xyz"] }),
      });
    } catch {
      errorThrown = true;
    }
    expect(errorThrown).toBe(true);
  });

  it("renders docs catch-all page within RootDocsLayout without throwing", async () => {
    const pageElement = await DocsCatchAllPage({
      params: Promise.resolve({ slug: [] }),
    });
    const element = React.createElement(
      RootProvider,
      null,
      React.createElement(RootDocsLayout, null, pageElement),
    );
    const html = renderToStaticMarkup(element);
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
  });

  it("renders documentation layout with nested children cleanly", () => {
    const element = React.createElement(
      RootProvider,
      null,
      React.createElement(
        RootDocsLayout,
        null,
        React.createElement("div", { id: "test-content" }, "Inner Docs Body"),
      ),
    );
    const html = renderToStaticMarkup(element);
    expect(html).toContain('id="test-content"');
  });
});
