"use client";

import Link from "next/link";
import { buildActiveJobUrl, shortUrlLabel } from "@/entities/lighthouse-run";
import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui";
import { useActiveAuditJob } from "../model/use-active-audit-job";

/**
 * Header indicator pill shown whenever a single-flight Lighthouse Audit Job is active.
 */
export function ActiveAuditJobIndicator() {
  const { job, pct, stageLabel, handleNavigate } = useActiveAuditJob();
  if (!job) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={buildActiveJobUrl(job.id)}
              onClick={handleNavigate}
              aria-label={`Running Audit Job for ${shortUrlLabel(job.url)}`}
            />
          }
        >
          <Badge variant="info" size="md">
            <span className="bg-info size-2 rounded-full" aria-hidden="true" />
            <span>Running · {pct}%</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">{shortUrlLabel(job.url)}</p>
            <p className="text-background/80">
              {stageLabel} · Click to view live stream
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
