"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DocsLayout, type DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import { source } from "@/lib/source";

const QUADRANT_SECTIONS = new Set(["how-to", "reference", "explanation"]);

const DOCS_NAV = {
  title: (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-fd-primary/10 text-fd-primary font-bold text-sm">
        D
      </div>
      <span className="font-bold tracking-tight">DevTools</span>
    </div>
  ),
  url: "/docs",
};

const DOCS_SIDEBAR = {
  collapsible: true,
  defaultOpenLevel: 1,
};

function TabIcon({ icon, color }: { icon: ReactNode; color: string }) {
  const iconStyle = useMemo<CSSProperties>(() => ({ color }), [color]);
  return (
    <div
      className="[&_svg]:size-full rounded-lg size-full p-0.5 [&_svg]:text-[inherit] max-md:bg-fd-muted max-md:border max-md:p-1.5"
      style={iconStyle}
    >
      {icon}
    </div>
  );
}

const DOCS_TABS: DocsLayoutProps["tabs"] = {
  transform(option, node) {
    const meta = source.getNodeMeta(node);
    const optionSection =
      option.url.replace(/^\/docs\/?/, "").split("/")[0] ||
      meta?.path?.split("/")[0] ||
      "tutorials";
    const color = optionSection
      ? `var(--${optionSection}-color, var(--color-fd-foreground))`
      : "var(--color-fd-foreground)";

    return {
      ...option,
      icon: <TabIcon icon={node.icon} color={color} />,
    };
  },
};

export default function RootDocsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const section =
    segments[1] && QUADRANT_SECTIONS.has(segments[1])
      ? segments[1]
      : "tutorials";

  const containerProps = useMemo(
    () => ({
      className: section ? `${section} group-${section}` : "",
      style: section
        ? ({
            "--color-fd-primary": `var(--${section}-color)`,
          } as CSSProperties)
        : undefined,
    }),
    [section],
  );

  return (
    <DocsLayout
      tree={source.pageTree}
      containerProps={containerProps}
      nav={DOCS_NAV}
      tabs={DOCS_TABS}
      sidebar={DOCS_SIDEBAR}
    >
      {children}
    </DocsLayout>
  );
}
