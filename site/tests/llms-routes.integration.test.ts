import { describe, expect, it } from "bun:test";
import { GET as getLlmsTxt } from "../src/app/llms.txt/route";
import { GET as getLlmsFullTxt } from "../src/app/llms-full.txt/route";

describe("structured llm context endpoints seam", () => {
  it("exposes plain-text documentation index at /llms.txt with text/plain content type", async () => {
    const response = await getLlmsTxt();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");

    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
    expect(text.startsWith("#")).toBe(true);
  });

  it("exposes full plain-text documentation corpus at /llms-full.txt with url headings", async () => {
    const response = await getLlmsFullTxt();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");

    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("URL: /docs");
  });
});
