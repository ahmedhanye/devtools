import { describe, expect, it } from "bun:test";
import { getMermaidThemeConfig } from "../src/lib/mermaid";

describe("Mermaid Theme Configuration (Unit)", () => {
  it("adapts mermaid theme configuration between light and dark modes", () => {
    const darkConfig = getMermaidThemeConfig("dark");
    expect(darkConfig.theme).toBe("dark");

    const lightConfig = getMermaidThemeConfig("light");
    expect(lightConfig.theme).toBe("neutral");

    const fallbackConfig = getMermaidThemeConfig(undefined);
    expect(fallbackConfig.theme).toBe("neutral");
  });
});
