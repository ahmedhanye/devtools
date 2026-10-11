import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Mermaid, getMermaidThemeConfig } from "../src/components/mermaid";

describe("diagram rendering component seam", () => {
  it("adapts mermaid theme configuration between light and dark modes", () => {
    const darkConfig = getMermaidThemeConfig("dark");
    expect(darkConfig.theme).toBe("dark");

    const lightConfig = getMermaidThemeConfig("light");
    expect(lightConfig.theme).toBe("neutral");

    const fallbackConfig = getMermaidThemeConfig(undefined);
    expect(fallbackConfig.theme).toBe("neutral");
  });

  it("renders accessible diagram container with role, aria-label, and describedby association", () => {
    const sampleChart = `
flowchart TD
  CLI["CLI Process"] --> Daemon["Background Daemon"]
`;
    const html = renderToStaticMarkup(
      React.createElement(Mermaid, {
        chart: sampleChart,
        title: "Architecture Flow",
        description:
          "CLI process dispatching commands to the background daemon",
      }),
    );

    expect(html).toContain('role="figure"');
    expect(html).toContain('aria-label="Architecture Flow"');

    const match = html.match(/aria-describedby="([^"]+)"/);
    expect(match).not.toBeNull();
    const descId = match![1];
    expect(html).toContain(`id="${descId}"`);
  });

  it("provides fallback label when title is omitted", () => {
    const sampleChart = `
sequenceDiagram
  Client->>Server: Request
  Server-->>Client: Response
`;
    const html = renderToStaticMarkup(
      React.createElement(Mermaid, {
        chart: sampleChart,
      }),
    );

    expect(html).toContain('role="figure"');
    expect(html).toContain('aria-label="Diagram visualization"');
  });
});
