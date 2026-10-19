import { docs } from "@/.source/server";
import { loader } from "fumadocs-core/source";
import { statusBadgesPlugin } from "fumadocs-core/source/plugins/status-badges";
import { createElement } from "react";
import * as icons from "lucide-react";

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

function patchTree(tree: typeof baseSource.pageTree) {
  if (!tree || !Array.isArray(tree.children)) return tree;

  for (const child of tree.children) {
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

    const quadrantOverviews = [
      { names: ["How-To Guides", "how-to"], url: "/docs/how-to" },
      { names: ["Reference", "reference"], url: "/docs/reference" },
      { names: ["Explanation", "explanation"], url: "/docs/explanation" },
    ];

    for (const quadrant of quadrantOverviews) {
      const matchesName =
        typeof child.name === "string" && quadrant.names.includes(child.name);
      const matchesId =
        typeof child.$id === "string" && quadrant.names.includes(child.$id);

      if (child.type === "folder" && (matchesName || matchesId)) {
        for (const item of child.children || []) {
          if (item.type === "page" && item.url === quadrant.url) {
            item.name = "Overview";
          }
        }
      }
    }
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
