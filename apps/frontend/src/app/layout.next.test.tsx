import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import RootLayout from "./layout.next";

describe("RootLayout seam", () => {
  it("renders with min-h-dvh class and children", () => {
    const html = renderToString(
      <RootLayout>
        <div data-testid="child">Test Child</div>
      </RootLayout>,
    );
    expect(html).toContain("min-h-dvh");
    expect(html).toContain("Test Child");
  });
});
