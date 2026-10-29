import { docs } from "@/.source/server";
import { loader } from "fumadocs-core/source";
import { statusBadgesPlugin } from "fumadocs-core/source/plugins/status-badges";
import { createElement } from "react";
import * as icons from "lucide-react";

const QUADRANT_OVERVIEWS = [
  { names: ["How-To Guides", "how-to"], url: "/docs/how-to" },
  { names: ["Reference", "reference"], url: "/docs/reference" },
  { names: ["Explanation", "explanation"], url: "/docs/explanation" },
] as const;

const baseSource = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  slugs(_file, defaultSlugs) {
    const s = defaultSlugs();
    if (s[0] === "tutorials") {
      return s.slice(1);
    }
    return s;
  },
  plugins: [
    statusBadgesPlugin({
      renderBadge(status) {
        const variants: Record<string, string> = {
          new: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
          beta: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
          deprecated:
            "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
        };
        return createElement(
          "span",
          {
            className: `text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${variants[status] ?? "bg-fd-muted text-fd-muted-foreground border-fd-border"}`,
          },
          status,
        );
      },
    }),
  ],
  icon(icon) {
    if (!icon) return;
    if (icon in icons) {
      const Comp = icons[icon as keyof typeof icons] as React.ComponentType<{
        className?: string;
      }>;
      return createElement(Comp, { className: "size-4 text-fd-primary" });
    }
  },
});

type PageTreeNode = (typeof baseSource.pageTree.children)[number];

function patchTutorialsFolder(child: PageTreeNode): void {
  if (
    child.type === "folder" &&
    (child.name === "Tutorials" || child.$id === "tutorials")
  ) {
    const remainingChildren = (child.children || []).filter(
      (c) =>
        !("url" in c) || (c.url !== "/docs/tutorials" && c.url !== "/docs"),
    );
    child.children = [
      {
        $id: "tutorials:intro",
        type: "page",
        name: "Introduction",
        url: "/docs",
        $ref: "index.mdx",
      },
      ...remainingChildren,
    ];
  }
}

function isMatchingQuadrantFolder(
  child: PageTreeNode,
  names: readonly string[],
): boolean {
  const nameMatch =
    typeof child.name === "string" && names.includes(child.name);
  const idMatch = typeof child.$id === "string" && names.includes(child.$id);
  return nameMatch || idMatch;
}

function renameOverviewPage(children: PageTreeNode[], targetUrl: string): void {
  for (const item of children) {
    if (item.type === "page" && item.url === targetUrl) {
      item.name = "Overview";
    }
  }
}

function patchQuadrantOverviewLabels(child: PageTreeNode): void {
  if (child.type === "folder") {
    for (const quadrant of QUADRANT_OVERVIEWS) {
      if (isMatchingQuadrantFolder(child, quadrant.names)) {
        renameOverviewPage(child.children || [], quadrant.url);
      }
    }
  }
}

function patchTree(tree: typeof baseSource.pageTree) {
  if (!tree || !Array.isArray(tree.children)) return tree;

  for (const child of tree.children) {
    patchTutorialsFolder(child);
    patchQuadrantOverviewLabels(child);
  }

  return tree;
}

baseSource.pageTree = patchTree(baseSource.pageTree);

export const source = baseSource;

export function resolveDocPage(slug?: string[]) {
  return !slug || slug.length === 0
    ? source.getPage([]) || source.getPageByUrl("/docs")
    : source.getPage(slug);
}
