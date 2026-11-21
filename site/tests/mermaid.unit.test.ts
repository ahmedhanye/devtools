import { describe, expect, it } from "bun:test";
import { getMermaidThemeConfig, sanitizeMermaidSvg } from "../src/lib/mermaid";

describe("Mermaid Theme Configuration & Sanitizer (Unit)", () => {
  it("adapts mermaid theme configuration between light and dark modes", () => {
    const darkConfig = getMermaidThemeConfig("dark");
    expect(darkConfig.theme).toBe("dark");

    const lightConfig = getMermaidThemeConfig("light");
    expect(lightConfig.theme).toBe("neutral");

    const fallbackConfig = getMermaidThemeConfig(undefined);
    expect(fallbackConfig.theme).toBe("neutral");
  });

  it("preserves trimmed and uppercase valid SVG markup including safe attributes and boolean flags", () => {
    const padded = '  <SVG id="m1" data-flag viewBox="0 0 10 10"><g/></SVG>  ';
    const result = sanitizeMermaidSvg(padded);
    expect(result).toBe(
      '<SVG id="m1" data-flag viewBox="0 0 10 10"><g/></SVG>',
    );

    const singleQuoted = "<svg title='Diagram'><a href='/docs'>x</a></svg>";
    expect(sanitizeMermaidSvg(singleQuoted)).toBe(singleQuoted);
  });

  it("rejects non-svg root tags including prefix collisions like <svgx>", () => {
    expect(sanitizeMermaidSvg("<div>bad</div>")).toBe("");
    expect(sanitizeMermaidSvg("<svgx>fake</svgx>")).toBe("");
  });

  it("strips script, nested script, and dangerous elements inside foreignObject", () => {
    expect(
      sanitizeMermaidSvg(
        "<svg><script>alert(1)</script ><scr<script></script>ipt>alert(2)</scr<script></script>ipt></svg>",
      ),
    ).toBe("<svg></svg>");

    expect(
      sanitizeMermaidSvg(
        "<svg><foreignObject><img/src=x/onerror=alert(1)></foreignObject></svg>",
      ),
    ).toBe("<svg><foreignObject></foreignObject></svg>");
  });

  it("strips slash-separated and concatenated event handlers, srcdoc, and encoded unsafe URIs", () => {
    expect(sanitizeMermaidSvg("<svg/onload=alert(1)><g/></svg>")).toBe(
      "<svg><g/></svg>",
    );
    expect(sanitizeMermaidSvg('<svg title="x"onload=alert(1)></svg>')).toBe(
      '<svg title="x"></svg>',
    );
    expect(
      sanitizeMermaidSvg('<svg srcdoc="<script>alert(1)</script>"></svg>'),
    ).toBe("<svg></svg>");

    const encodedHref = sanitizeMermaidSvg(
      '<svg><a href="&#106;avascript:alert(1)">a</a><a xlink:href="&#x6a;ava&tab;script&colon;alert(2)">b</a><a href="data:text/html,<script>">c</a><a href="&#99999999;safe">d</a></svg>',
    );
    expect(encodedHref).not.toContain("javascript:");
    expect(encodedHref).not.toContain("data:");
    expect(encodedHref).toContain('href="&#99999999;safe"');
  });
});
