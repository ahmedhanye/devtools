import { describe, expect, it } from "bun:test";
import { GET } from "../src/app/api/search/route";

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
