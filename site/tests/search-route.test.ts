import { describe, expect, it } from "bun:test";
import { GET } from "../src/app/api/search/route";
import { parseMarkdownMetadata } from "../src/lib/docs-index";

describe("search api route seam", () => {
  it("returns empty json array when query parameter is empty or absent", async () => {
    const request = new Request("http://localhost:3000/api/search");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("responds to search queries across indexed documentation pages", async () => {
    const request = new Request(
      "http://localhost:3000/api/search?query=DevTools",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].url).toContain("/docs");
  });
});

describe("parseMarkdownMetadata", () => {
  it("preserves body content when frontmatter is empty", () => {
    const raw = "---\n---\nGuide body content";
    const details = parseMarkdownMetadata(raw);
    expect(details.title).toBe("DevTools Documentation");
    expect(details.description).toBeUndefined();
    expect(details.content).toBe("Guide body content");
  });

  it("extracts title, description, and body when frontmatter is present", () => {
    const raw =
      "---\ntitle: 'Custom Guide'\ndescription: \"Helpful desc\"\n---\nCustom body";
    const details = parseMarkdownMetadata(raw);
    expect(details.title).toBe("Custom Guide");
    expect(details.description).toBe("Helpful desc");
    expect(details.content).toBe("Custom body");
  });

  it("falls back gracefully when frontmatter delimiters are missing", () => {
    const raw = "Plain document without frontmatter";
    const details = parseMarkdownMetadata(raw);
    expect(details.title).toBe("DevTools Documentation");
    expect(details.content).toBe("Plain document without frontmatter");
  });
});
