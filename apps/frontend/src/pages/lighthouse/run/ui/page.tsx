"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  AuditJob,
  AuditSseErrorEvent,
  AuditSseProgressEvent,
  LighthouseProgressStage,
} from "@devtools/lighthouse/schemas";
import {
  AlertCircle,
  ArrowLeft,
  Circle,
  CircleCheck,
  Clock,
  ExternalLink,
  GitCompare,
  Globe,
  LoaderCircle,
  RotateCw,
} from "lucide-react";
import {
  ACTIVE_PROGRESS_STAGE_ORDER,
  buildHistoryUrl,
  buildRunDetailUrl,
  computeAuditProgressPercent,
  LighthouseEmptyNotice,
  PROGRESS_STAGE_LABELS,
  RunDetailBody,
  shortRunId,
} from "@/entities/lighthouse-run";
import { TriggerAuditSheet } from "@/features/lighthouse/trigger-audit";
import {
  cn,
  updateNativeSearchParams,
  useNativeSearchParams,
} from "@/shared/lib";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/shared/ui";
import { useLiveJobStream } from "../model/use-live-job-stream";
import { useRunDetail } from "../model/use-run-detail";

function BackToLighthouseLink() {
  return (
    <Link
      href={buildHistoryUrl()}
      className="border-border bg-background text-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors"
    >
      <ArrowLeft className="size-3.5" />
      <span>Back to Lighthouse</span>
    </Link>
  );
}

function useElapsedSeconds(frozen: boolean): string {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (frozen) {
      return undefined;
    }
    const startMs = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startMs);
    }, 100);
    return () => {
      clearInterval(timer);
    };
  }, [frozen]);

  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

type StepState = "done" | "active" | "pending";

const DIAL_TICKS = Array.from({ length: 24 }, (_, idx) => idx);
const ITERATION_SUBSTAGES: readonly {
  stage: LighthouseProgressStage;
  stageIdx: number;
}[] = [
  { stage: "launching_browser", stageIdx: 1 },
  { stage: "navigating", stageIdx: 2 },
  { stage: "analyzing", stageIdx: 3 },
];

function toTraceStatus(state: StepState): "running" | "pending" | undefined {
  if (state === "active") {
    return "running";
  }
  return state === "pending" ? "pending" : undefined;
}

function TraceStatusIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return <CircleCheck className="text-success" />;
  }
  if (state === "active") {
    return <LoaderCircle className="text-primary animate-spin" />;
  }
  return <Circle className="text-muted-foreground/60" />;
}

function TraceStepItem({
  label,
  state,
  liveMessage,
}: {
  label: string;
  state: StepState;
  liveMessage?: string;
}) {
  const line = (
    <TraceLine status={toTraceStatus(state)}>
      <TraceIcon>
        <TraceStatusIcon state={state} />
      </TraceIcon>
      <TraceTitle>{label}</TraceTitle>
    </TraceLine>
  );

  if (state === "active" && liveMessage) {
    return (
      <TraceCollapsible defaultOpen>
        {line}
        <TraceCollapsibleContent>
          <span className="text-xs">{liveMessage}</span>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    );
  }

  return line;
}

function FlatActivityRail({
  stageIdx,
  description,
}: {
  stageIdx: number;
  description: string;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-border mb-3.5 flex items-center justify-between border-b pb-3">
        <span className="text-sm font-semibold">Audit Activity</span>
        <span className="text-muted-foreground text-xs">
          Single iteration · {ACTIVE_PROGRESS_STAGE_ORDER.length} steps
        </span>
      </div>

      <Trace>
        {ACTIVE_PROGRESS_STAGE_ORDER.map((stage, idx) => {
          const stepState = stageStepState(idx, stageIdx);
          return (
            <TraceStepItem
              key={stage}
              label={PROGRESS_STAGE_LABELS[stage]}
              state={stepState}
              liveMessage={stepState === "active" ? description : undefined}
            />
          );
        })}
      </Trace>
    </div>
  );
}

const ITERATION_COUNT_LABELS: Record<StepState, string> = {
  done: "completed 3 steps",
  active: "running 3 steps",
  pending: "3 steps",
};

function resolveIterationState(
  runIndex: number,
  activeRunIdx: number,
  stageIdx: number,
  isCompleting: boolean,
): StepState {
  if (isCompleting || stageIdx >= 4 || runIndex < activeRunIdx) {
    return "done";
  }
  if (stageIdx >= 1 && stageIdx <= 3 && runIndex === activeRunIdx) {
    return "active";
  }
  return "pending";
}

function resolveSubStageState(
  iterState: StepState,
  subStageIdx: number,
  stageIdx: number,
): StepState {
  if (iterState === "done") {
    return "done";
  }
  if (iterState === "active") {
    return stageStepState(subStageIdx, stageIdx);
  }
  return "pending";
}

function IterationTraceItem({
  runIndex,
  totalRuns,
  activeRunIdx,
  stageIdx,
  isCompleting,
  description,
  expandedOverride,
  onOpenChange,
}: {
  runIndex: number;
  totalRuns: number;
  activeRunIdx: number;
  stageIdx: number;
  isCompleting: boolean;
  description: string;
  expandedOverride: boolean | undefined;
  onOpenChange: (nextOpen: boolean) => void;
}) {
  const iterState = resolveIterationState(
    runIndex,
    activeRunIdx,
    stageIdx,
    isCompleting,
  );
  const isOpen = expandedOverride ?? iterState === "active";

  return (
    <TraceCollapsible open={isOpen} onOpenChange={onOpenChange}>
      <TraceCollapsibleTrigger>
        <TraceLine status={toTraceStatus(iterState)}>
          <TraceIcon>
            <TraceStatusIcon state={iterState} />
          </TraceIcon>
          <TraceTitle>
            Iteration {runIndex + 1} of {totalRuns}
          </TraceTitle>
          <TraceDescription>
            {ITERATION_COUNT_LABELS[iterState]}
          </TraceDescription>
        </TraceLine>
      </TraceCollapsibleTrigger>

      <TraceCollapsibleContent keepMounted>
        <Trace>
          {ITERATION_SUBSTAGES.map(
            ({ stage: subStage, stageIdx: subStageIdx }) => {
              const subState = resolveSubStageState(
                iterState,
                subStageIdx,
                stageIdx,
              );
              return (
                <TraceStepItem
                  key={subStage}
                  label={PROGRESS_STAGE_LABELS[subStage]}
                  state={subState}
                  liveMessage={subState === "active" ? description : undefined}
                />
              );
            },
          )}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

function NestedActivityRail({
  totalRuns,
  activeRunIdx,
  stageIdx,
  isCompleting,
  description,
}: {
  totalRuns: number;
  activeRunIdx: number;
  stageIdx: number;
  isCompleting: boolean;
  description: string;
}) {
  const [expandedOverrides, setExpandedOverrides] = useState<
    Record<number, boolean>
  >({});

  const locateState: StepState =
    isCompleting || stageIdx > 0 ? "done" : "active";
  const reportState: StepState = isCompleting
    ? "done"
    : stageIdx === 4
      ? "active"
      : "pending";

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-border mb-3.5 flex items-center justify-between border-b pb-3">
        <span className="text-sm font-semibold">Audit Activity</span>
        <span className="text-muted-foreground text-xs">
          {totalRuns} iterations · click any pass to inspect
        </span>
      </div>

      <Trace>
        <TraceStepItem
          label={PROGRESS_STAGE_LABELS.locating_browser}
          state={locateState}
          liveMessage={locateState === "active" ? description : undefined}
        />

        {Array.from({ length: totalRuns }, (_, r) => (
          <IterationTraceItem
            key={r}
            runIndex={r}
            totalRuns={totalRuns}
            activeRunIdx={activeRunIdx}
            stageIdx={stageIdx}
            isCompleting={isCompleting}
            description={description}
            expandedOverride={expandedOverrides[r]}
            onOpenChange={(nextOpen) =>
              setExpandedOverrides((prev) => ({ ...prev, [r]: nextOpen }))
            }
          />
        ))}

        <TraceStepItem
          label={PROGRESS_STAGE_LABELS.generating_report}
          state={reportState}
          liveMessage={reportState === "active" ? description : undefined}
        />
      </Trace>
    </div>
  );
}

function LiveJobMetaBadges({ activeJob }: { activeJob: AuditJob | null }) {
  if (!activeJob) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="neutral">{activeJob.formFactor}</Badge>
      <Badge variant="outline">{activeJob.throttlingMethod}</Badge>
      <Badge variant="outline">
        {activeJob.runs} {activeJob.runs === 1 ? "iteration" : "iterations"}
      </Badge>
    </div>
  );
}

function resolveProgressEvent(
  latestProgress: AuditSseProgressEvent | null,
  activeJob: AuditJob | null,
): AuditSseProgressEvent | null {
  const polled = activeJob?.latestProgress ?? null;
  if (!latestProgress) {
    return polled;
  }
  if (!polled) {
    return latestProgress;
  }
  return new Date(polled.timestamp).getTime() >
    new Date(latestProgress.timestamp).getTime()
    ? polled
    : latestProgress;
}

function formatProgressDescription(
  event: AuditSseProgressEvent | null,
): string {
  const baseMessage = event
    ? event.message
    : "Initializing isolated Lighthouse runner...";
  if (
    !event ||
    event.runIndex === undefined ||
    event.totalRuns === undefined ||
    event.totalRuns <= 1 ||
    event.stage === "locating_browser" ||
    event.stage === "generating_report"
  ) {
    return baseMessage;
  }
  const iteration = Math.min(event.runIndex, event.totalRuns - 1) + 1;
  return `${baseMessage} (Iteration ${iteration} of ${event.totalRuns})`;
}

function computeProgressMetrics(
  latestProgress: AuditSseProgressEvent | null,
  activeJob: AuditJob | null,
) {
  const event = resolveProgressEvent(latestProgress, activeJob);
  const currentStage: LighthouseProgressStage = event
    ? event.stage
    : "locating_browser";
  const stageIdx = Math.max(
    0,
    ACTIVE_PROGRESS_STAGE_ORDER.indexOf(currentStage),
  );
  const pct = computeAuditProgressPercent(
    currentStage,
    event?.runIndex,
    event?.totalRuns ?? activeJob?.runs,
  );

  return {
    stageIdx,
    pct,
    description: formatProgressDescription(event),
  };
}

function stageStepState(
  index: number,
  stageIdx: number,
): "done" | "active" | "pending" {
  if (index < stageIdx) {
    return "done";
  }
  return index === stageIdx ? "active" : "pending";
}

function parseTargetUrl(rawUrl: string): { host: string; path: string } {
  const parsed = new URL(rawUrl);
  const path =
    parsed.pathname === "/" && !parsed.search
      ? ""
      : `${parsed.pathname}${parsed.search}`;
  return { host: parsed.host, path };
}

function RadialTelemetryDial({ pct }: { pct: number }) {
  const litTicks = Math.round((pct / 100) * DIAL_TICKS.length);
  return (
    <div
      role="progressbar"
      aria-label="Audit progress"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative flex size-38 items-center justify-center"
    >
      <svg width="152" height="152" viewBox="0 0 152 152" aria-hidden="true">
        {DIAL_TICKS.map((tick) => {
          const isLit = tick < litTicks;
          return (
            <line
              key={tick}
              x1="76"
              y1="12"
              x2="76"
              y2="24"
              strokeWidth="3.6"
              strokeLinecap="round"
              transform={`rotate(${tick * 15} 76 76)`}
              className={cn(
                "transition-colors duration-200",
                isLit
                  ? pct === 100
                    ? "stroke-success"
                    : "stroke-primary"
                  : "stroke-border",
              )}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold tracking-tight tabular-nums">
          {pct}%
        </span>
      </div>
    </div>
  );
}

function TargetUrlFooter({ url }: { url: string | null }) {
  const urlParts = url ? parseTargetUrl(url) : null;

  return (
    <div className="border-border bg-muted/15 flex w-full min-w-0 flex-col items-center gap-2 border-t px-5 py-4">
      <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        Target URL
      </span>
      {url && urlParts ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={url}
            className="border-border bg-background text-foreground hover:border-primary/50 inline-flex w-full max-w-full min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors"
          >
            <Globe
              className="text-muted-foreground size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span className="min-w-0 truncate">{urlParts.host}</span>
            <ExternalLink
              className="text-muted-foreground/70 size-3 shrink-0"
              aria-hidden="true"
            />
          </a>
          {urlParts.path ? (
            <span
              className="text-muted-foreground w-full truncate px-1 font-mono text-xs"
              title={url}
            >
              {urlParts.path}
            </span>
          ) : null}
        </>
      ) : (
        <span className="text-muted-foreground text-xs">
          Loading target URL...
        </span>
      )}
    </div>
  );
}

function LiveJobCard({
  activeJob,
  pct,
  stageIdx,
  totalRuns,
  activeRunIdx,
  description,
  isCompleting,
}: {
  activeJob: AuditJob | null;
  pct: number;
  stageIdx: number;
  totalRuns: number;
  activeRunIdx: number;
  description: string;
  isCompleting: boolean;
}) {
  const elapsedLabel = useElapsedSeconds(isCompleting);

  return (
    <section className="border-border bg-card text-card-foreground overflow-hidden rounded-xl border shadow-xs">
      <div className="flex flex-col items-stretch md:flex-row">
        <aside className="border-border bg-muted/30 flex flex-col justify-between border-b text-center md:w-72 md:shrink-0 md:border-r md:border-b-0">
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-7">
            <RadialTelemetryDial pct={pct} />
            <div className="border-border bg-background text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums">
              <Clock
                className="text-muted-foreground size-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>{elapsedLabel}</span>
            </div>
            <LiveJobMetaBadges activeJob={activeJob} />
            <p className="text-muted-foreground max-w-56 text-xs leading-relaxed">
              Audit Summary and the interactive Lighthouse HTML Report will open
              automatically on this page when the run completes.
            </p>
          </div>

          <TargetUrlFooter url={activeJob?.url ?? null} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col p-6">
          {totalRuns === 1 ? (
            <FlatActivityRail stageIdx={stageIdx} description={description} />
          ) : (
            <NestedActivityRail
              totalRuns={totalRuns}
              activeRunIdx={activeRunIdx}
              stageIdx={stageIdx}
              isCompleting={isCompleting}
              description={description}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function FailedJobNotice({ error }: { error: AuditSseErrorEvent["error"] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <BackToLighthouseLink />
        <Badge variant="destructive">Audit Job Failed</Badge>
      </div>
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>Audit Job Failed ({error.code})</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    </div>
  );
}

function ExpiredJobNotice({ jobId }: { jobId: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <BackToLighthouseLink />
      </div>
      <LighthouseEmptyNotice
        icon={<AlertCircle />}
        title="Audit Job not found or expired"
        description={`No active Audit Job was found for ID ${shortRunId(jobId)}. Completed runs remain available in Audit History.`}
        action={
          <Link
            href={buildHistoryUrl()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium transition-colors"
          >
            Return to Audit History
          </Link>
        }
      />
    </div>
  );
}

function resolveLiveJobDisplayMetrics(
  latestProgress: Parameters<typeof computeProgressMetrics>[0],
  activeJob: Parameters<typeof computeProgressMetrics>[1],
  isCompleting: boolean,
) {
  const event = resolveProgressEvent(latestProgress, activeJob);
  const metrics = computeProgressMetrics(latestProgress, activeJob);
  const totalRuns = Math.max(1, event?.totalRuns ?? activeJob?.runs ?? 1);
  const activeRunIdx = Math.max(
    0,
    Math.min(event?.runIndex ?? 0, totalRuns - 1),
  );
  return {
    pct: isCompleting ? 100 : metrics.pct,
    stageIdx: isCompleting
      ? ACTIVE_PROGRESS_STAGE_ORDER.length
      : metrics.stageIdx,
    totalRuns,
    activeRunIdx,
    description: metrics.description,
  };
}

function LiveJobTracker({ jobId }: { jobId: string }) {
  const {
    activeJob,
    latestProgress,
    sseError,
    isExpired,
    isCompleting,
    isStreamDisconnected,
    handleReconnect,
  } = useLiveJobStream(jobId);

  if (sseError) {
    return <FailedJobNotice error={sseError} />;
  }

  if (isExpired) {
    return <ExpiredJobNotice jobId={jobId} />;
  }

  const { pct, stageIdx, totalRuns, activeRunIdx, description } =
    resolveLiveJobDisplayMetrics(latestProgress, activeJob, isCompleting);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BackToLighthouseLink />
          <Badge variant="outline">
            <span className="font-mono">Job {shortRunId(jobId)}</span>
          </Badge>
        </div>
      </div>

      {isStreamDisconnected ? (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertTitle>Live stream disconnected</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Progress is updating via background polling after repeated
                connection drops.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReconnect}
              >
                Reconnect
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <LiveJobCard
        activeJob={activeJob}
        pct={pct}
        stageIdx={stageIdx}
        totalRuns={totalRuns}
        activeRunIdx={activeRunIdx}
        description={description}
        isCompleting={isCompleting}
      />
    </div>
  );
}

function RunDetailTopBar({
  runId,
  compareHref,
  activeTab,
  hasRun,
  onOpenRerun,
}: {
  runId: string;
  compareHref: string;
  activeTab: "summary" | "report";
  hasRun: boolean;
  onOpenRerun: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <BackToLighthouseLink />
        <Badge variant="outline">
          <span className="font-mono">Run {shortRunId(runId)}</span>
        </Badge>
      </div>

      {hasRun ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={compareHref}
            className="border-border bg-background text-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors"
          >
            <GitCompare className="size-3.5" />
            <span>Compare Run</span>
          </Link>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onOpenRerun}
          >
            <RotateCw className="size-3.5" />
            <span>Re-run</span>
          </Button>
          <a
            href={buildRunDetailUrl(runId, activeTab)}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border bg-background text-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors"
          >
            <ExternalLink className="size-3.5" />
            <span>New Window</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}

function MissingRunSelectionEmptyState() {
  return (
    <LighthouseEmptyNotice
      icon={<AlertCircle />}
      title="No Audit Run or Audit Job selected"
      description="Open a run from Audit History or launch a new Lighthouse Audit Job."
      action={
        <Link
          href={buildHistoryUrl()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium transition-colors"
        >
          Go to Audit History
        </Link>
      }
    />
  );
}

function RunDetailPageContent({
  runId,
  activeTab,
  onTabChange,
}: {
  runId: string;
  activeTab: "summary" | "report";
  onTabChange: (nextValue: unknown) => void;
}) {
  const [triggerOpen, setTriggerOpen] = useState(false);
  const detail = useRunDetail(runId);

  const handleOpenRerun = useCallback(() => {
    setTriggerOpen(true);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <RunDetailTopBar
        runId={runId}
        compareHref={detail.compareHref}
        activeTab={activeTab}
        hasRun={Boolean(detail.run)}
        onOpenRerun={handleOpenRerun}
      />

      <RunDetailBody
        variant="page"
        isPending={detail.isRunPending}
        errorMessage={detail.errorMessage}
        run={detail.run}
        tab={activeTab}
        onTabChange={onTabChange}
        onRetry={detail.handleRetryRun}
      />

      {detail.run ? (
        <TriggerAuditSheet
          open={triggerOpen}
          onOpenChange={setTriggerOpen}
          initialUrl={detail.run.url}
        />
      ) : null}
    </div>
  );
}

/**
 * Dedicated Lighthouse Audit Run detail & live Audit Job streaming page (`/lighthouse/run`).
 */
export function RunPage() {
  const searchParams = useNativeSearchParams();
  const jobId = searchParams.get("job");
  const runId = searchParams.get("id");
  const activeTab: "summary" | "report" =
    searchParams.get("tab") === "report" ? "report" : "summary";

  const handleTabChange = useCallback((nextValue: unknown) => {
    const tab = nextValue === "report" ? "report" : "summary";
    updateNativeSearchParams(
      (params) => {
        if (tab === "report") {
          params.set("tab", "report");
        } else {
          params.delete("tab");
        }
      },
      { replace: true },
    );
  }, []);

  if (jobId) {
    return <LiveJobTracker key={jobId} jobId={jobId} />;
  }

  if (!runId) {
    return <MissingRunSelectionEmptyState />;
  }

  return (
    <RunDetailPageContent
      runId={runId}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    />
  );
}
