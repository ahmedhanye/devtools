"use client";

import type * as React from "react";
import { useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn, updateNativeSearchParams } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { buildCompareUrl, buildHistoryUrl } from "../model/thresholds";

/**
 * Shared Lighthouse workspace header switching between Audit History and Compare views.
 */
export function LighthouseHeader({
  activeView,
  onNewAudit,
}: {
  activeView: "history" | "compare";
  onNewAudit?: () => void;
}) {
  const pathname = usePathname();

  const handleCompareClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (pathname === "/lighthouse/compare") {
        event.preventDefault();
        updateNativeSearchParams("");
      }
    },
    [pathname],
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">
          Lighthouse
        </h1>
        <p className="text-muted-foreground text-sm">
          Audit history, Core Web Vitals diagnostics, and multi-run performance
          comparisons.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <nav
          aria-label="Lighthouse sections"
          className="bg-muted text-muted-foreground border-border inline-flex items-center gap-1 rounded-lg border p-1"
        >
          <Link
            href={buildHistoryUrl()}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-3 text-sm font-medium transition-colors",
              activeView === "history"
                ? "bg-background text-foreground shadow-xs"
                : "hover:text-foreground",
            )}
          >
            History
          </Link>
          <Link
            href={buildCompareUrl()}
            onClick={handleCompareClick}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-3 text-sm font-medium transition-colors",
              activeView === "compare"
                ? "bg-background text-foreground shadow-xs"
                : "hover:text-foreground",
            )}
          >
            Compare
          </Link>
        </nav>
        {onNewAudit ? (
          <Button type="button" size="lg" onClick={onNewAudit}>
            <Plus className="size-4" />
            <span>New Audit</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
