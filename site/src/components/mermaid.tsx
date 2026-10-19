"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type mermaidType from "mermaid";
import { getMermaidThemeConfig } from "../lib/mermaid";

export interface MermaidProps {
  chart: string;
  title?: string;
  description?: string;
  className?: string;
  /** Pre-rendered SVG markup for SSR or testing seam */
  initialSvg?: string;
}

export function Mermaid({
  chart,
  title,
  description,
  className = "",
  initialSvg,
}: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rawId = useId().replace(/:/g, "_");
  const uniqueId = `mermaid_${rawId}`;
  const descId = `mermaid_desc_${rawId}`;
  const [svgContent, setSvgContent] = useState<string | null>(
    initialSvg ?? null,
  );
  const [hasError, setHasError] = useState(false);
  const { resolvedTheme } = useTheme();

  const innerHtml = useMemo(
    () => (svgContent ? { __html: svgContent } : undefined),
    [svgContent],
  );

  useEffect(() => {
    let isMounted = true;

    async function renderChart() {
      if (typeof window === "undefined" || !chart) return;

      try {
        const mermaidModule = (await import("mermaid"))
          .default as typeof mermaidType;
        const config = getMermaidThemeConfig(resolvedTheme);

        mermaidModule.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          ...config,
        });

        const renderId = `${uniqueId}_${Date.now()}`;
        const { svg } = await mermaidModule.render(renderId, chart.trim());

        if (isMounted) {
          setSvgContent(svg);
          setHasError(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to render Mermaid diagram:", err);
          setHasError(true);
        }
      }
    }

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart, resolvedTheme, uniqueId]);

  return (
    <figure
      aria-label={title || "Diagram visualization"}
      aria-describedby={description ? descId : undefined}
      className={`my-6 w-full overflow-x-auto rounded-lg border border-fd-border bg-fd-card/50 p-4 transition-colors ${className}`}
    >
      {title ? (
        <figcaption className="mb-3 text-center text-sm font-medium text-fd-foreground">
          {title}
        </figcaption>
      ) : null}

      {hasError ? (
        <div className="rounded border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
          <p className="font-semibold">Unable to render diagram</p>
          <pre className="mt-1 overflow-x-auto whitespace-pre font-mono">
            {chart}
          </pre>
        </div>
      ) : svgContent ? (
        <div
          ref={containerRef}
          className="flex w-full justify-center [&>svg]:h-auto [&>svg]:max-w-full"
          dangerouslySetInnerHTML={innerHtml}
        />
      ) : (
        <div
          ref={containerRef}
          className="flex min-h-[60px] w-full items-center justify-center text-xs text-fd-muted-foreground"
        >
          <span className="sr-only">Loading diagram</span>
          <pre className="hidden font-mono text-xs">{chart}</pre>
        </div>
      )}

      {description ? (
        <p id={descId} className="sr-only">
          {description}
        </p>
      ) : null}
    </figure>
  );
}
