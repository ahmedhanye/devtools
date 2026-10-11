export const GITHUB_REPO_URL = "https://github.com/AhmedHanye/devtools";

export interface NavLink {
  label: string;
  href: string;
  isExternal?: boolean;
}

export const NAV_LINKS: NavLink[] = [
  { label: "Docs", href: "/docs" },
  { label: "GitHub", href: GITHUB_REPO_URL, isExternal: true },
];

export type QuadrantId = "tutorials" | "how-to" | "reference" | "explanation";
export type QuadrantIconName =
  "GraduationCap" | "Compass" | "BookOpen" | "Layers";

export interface DiataxisQuadrant {
  id: QuadrantId;
  title: string;
  description: string;
  href: string;
  orientation: string;
  icon: QuadrantIconName;
}

export const DIATAXIS_QUADRANTS: DiataxisQuadrant[] = [
  {
    id: "tutorials",
    title: "Tutorials",
    description:
      "Step-by-step guides from initial setup to running the local daemon.",
    href: "/docs",
    orientation: "Learning-oriented",
    icon: "GraduationCap",
  },
  {
    id: "how-to",
    title: "How-To Guides",
    description: "Practical recipes for CLI workflows and developer tasks.",
    href: "/docs/how-to",
    orientation: "Problem-oriented",
    icon: "Compass",
  },
  {
    id: "reference",
    title: "Reference",
    description: "Technical specifications for APIs, CLI flags, and schemas.",
    href: "/docs/reference",
    orientation: "Information-oriented",
    icon: "BookOpen",
  },
  {
    id: "explanation",
    title: "Explanation",
    description:
      "Architecture deep dives into the loopback daemon and monorepo structure.",
    href: "/docs/explanation",
    orientation: "Understanding-oriented",
    icon: "Layers",
  },
];

export type FeatureIconName = "Cpu" | "Terminal" | "Server" | "Database";

export interface PlatformFeature {
  title: string;
  description: string;
  icon: FeatureIconName;
}

export const PLATFORM_FEATURES: PlatformFeature[] = [
  {
    title: "Unified Loopback Daemon",
    description:
      "A single production Bun process serves frontend static assets and Hono API routes in-process on 127.0.0.1, preventing port collisions.",
    icon: "Cpu",
  },
  {
    title: "Developer CLI",
    description:
      "Command-line tools featuring automatic port conflict detection, interactive prompts, and daemon lifecycle management.",
    icon: "Terminal",
  },
  {
    title: "Hono API Services",
    description:
      "Fast, lightweight HTTP API endpoints secured with loopback origin isolation and shared Zod schemas.",
    icon: "Server",
  },
  {
    title: "Embedded SQLite",
    description:
      "Local zero-configuration database persistence powered by Drizzle ORM with automated migrations.",
    icon: "Database",
  },
];

export interface HeroConfig {
  badge: string;
  headline: string;
  description: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
}

export const HERO_CONFIG: HeroConfig = {
  badge: "Developer Tooling Monorepo",
  headline: "Fast, Unified Developer Workflows",
  description:
    "DevTools unifies local CLI tools, a loopback daemon, HTTP APIs, and dashboard utilities into a single production Bun process.",
  primaryCta: {
    label: "Explore Documentation",
    href: "/docs",
  },
  secondaryCta: {
    label: "View on GitHub",
    href: GITHUB_REPO_URL,
  },
};
