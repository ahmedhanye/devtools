import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "../src/app/page";

describe("landing-page view seam", () => {
  it("renders page semantic landmarks cleanly without throwing", () => {
    const html = renderToStaticMarkup(React.createElement(HomePage));
    expect(html).toContain("<header");
    expect(html).toContain("<main");
    expect(html).toContain("<footer");
  });

  it("renders independently from documentation sidebar shell", () => {
    const html = renderToStaticMarkup(React.createElement(HomePage));
    expect(html).not.toContain('id="nd-sidebar"');
    expect(html).not.toContain("fd-sidebar");
  });
});
