"use client";

import { useCallback } from "react";
import Link from "next/link";
import { ExternalLink, Maximize2 } from "lucide-react";
import { buildRunDetailUrl, RunDetailBody } from "@/entities/lighthouse-run";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui";
import { type InspectorTab, useRunInspector } from "../model/use-run-inspector";

function InspectorHeaderLinks({
  runId,
  tab,
  onClose,
}: {
  runId: string;
  tab: InspectorTab;
  onClose: () => void;
}) {
  const detailHref = buildRunDetailUrl(runId, tab);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Link
        href={detailHref}
        onClick={onClose}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Maximize2 className="size-3.5" />
        <span>Open Full Page</span>
      </Link>
      <a
        href={detailHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <ExternalLink className="size-3.5" />
        <span>New Window</span>
      </a>
    </div>
  );
}

/**
 * Right-side slide-over inspector sheet for examining an Audit Run without losing History or Compare context.
 */
export function RunInspectorSheet({
  runId,
  onOpenChange,
}: {
  runId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const inspector = useRunInspector(runId);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Sheet open={Boolean(runId)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col data-[side=right]:sm:max-w-3xl"
      >
        <SheetHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pe-8">
            <div className="min-w-0 flex-1">
              <SheetTitle>Audit Run Inspector</SheetTitle>
              <SheetDescription>{inspector.descriptionText}</SheetDescription>
            </div>
            {inspector.run ? (
              <InspectorHeaderLinks
                runId={inspector.run.id}
                tab={inspector.activeTab}
                onClose={handleClose}
              />
            ) : null}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <RunDetailBody
            variant="compact"
            isPending={inspector.isPending}
            errorMessage={inspector.errorMessage}
            run={inspector.run}
            tab={inspector.activeTab}
            onTabChange={inspector.handleTabChange}
            onRetry={inspector.handleRetry}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
