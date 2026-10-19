export interface MermaidThemeConfig {
  theme: "dark" | "neutral";
  fontFamily: string;
}

export function getMermaidThemeConfig(theme?: string): MermaidThemeConfig {
  const isDark = theme === "dark";
  return {
    theme: isDark ? "dark" : "neutral",
    fontFamily: "inherit",
  };
}
