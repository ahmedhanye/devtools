import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Mermaid } from "../src/components/mermaid";
import { getMermaidThemeConfig } from "../src/lib/mermaid";

describe("diagram rendering component seam", () => {
  it("adapts mermaid theme configuration between light and dark modes", () => {
    const darkConfig = getMermaidThemeConfig("dark");
    expect(darkConfig.theme).toBe("dark");

    const lightConfig = getMermaidThemeConfig("light");
    expect(lightConfig.theme).toBe("neutral");

    const fallbackConfig = getMermaidThemeConfig(undefined);
    expect(fallbackConfig.theme).toBe("neutral");
  });

  it("renders accessible diagram container with semantic figure, aria-label, and describedby association", () => {
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

    expect(html.startsWith("<figure")).toBe(true);
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

    expect(html.startsWith("<figure")).toBe(true);
    expect(html).toContain('aria-label="Diagram visualization"');
  });

  it("renders pre-rendered SVG diagram markup when initialSvg is provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(Mermaid, {
        chart: "graph TD; A-->B;",
        initialSvg: '<svg data-testid="rendered-mermaid"><g></g></svg>',
      }),
    );
    expect(html).toContain('data-testid="rendered-mermaid"');
  });
});
