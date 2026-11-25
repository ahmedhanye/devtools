"use client";

import type * as React from "react";
import Link from "next/link";
import type {
  AttributedElement,
  ClsCulprit,
  LcpPhaseBreakdown,
  LighthouseFailedAudit,
  LighthouseInsightItem,
  LighthouseMedianMetadata,
  LighthouseRunDetail,
  LighthouseRunListItem,
} from "@devtools/lighthouse/schemas";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  Layers,
  Monitor,
  Smartphone,
} from "lucide-react";
import { cn } from "@/shared/lib";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  RadialGauge,
  type RadialGaugeTone,
  Skeleton,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { getLighthouseReportUrl } from "../api/lighthouse-api";
import {
  buildHistoryUrl,
  type CwvMetricKey,
  type CwvRating,
  FORM_FACTOR_LABELS,
  formatCwvValue,
  formatDurationMs,
  formatTimestamp,
  getCwvBarPositionPercent,
  getCwvRating,
  getCwvTone,
  getScoreTone,
  isFailingInsight,
  shortRunId,
  shortUrlLabel,
} from "../model/thresholds";
import { LighthouseEmptyNotice } from "./lighthouse-empty-notice";

/**
 * Runtime error and warning banners for an Audit Summary.
 */
function AuditRunAlerts({
  runtimeError,
  runWarnings,
}: {
  runtimeError: { code: string; message: string } | null;
  runWarnings: readonly string[];
}) {
  return (
    <>
      {runtimeError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Runtime Error ({runtimeError.code})</AlertTitle>
          <AlertDescription>{runtimeError.message}</AlertDescription>
        </Alert>
      ) : null}

      {runWarnings.length > 0 ? (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Run Warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-4">
              {runWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

/**
 * Four-category Lighthouse radial gauge card (Performance, Accessibility, Best Practices, SEO).
 */
function CategoryScoresCard({ run }: { run: LighthouseRunDetail }) {
  const categoryEntries = [
    { label: "Performance", score: run.performanceScore },
    { label: "Accessibility", score: run.accessibilityScore },
    { label: "Best Practices", score: run.bestPracticesScore },
    { label: "SEO", score: run.seoScore },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Scores</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categoryEntries.map((entry) => (
            <div
              key={entry.label}
              className="border-border bg-card flex items-center justify-center rounded-lg border py-4"
            >
              <RadialGauge
                value={entry.score}
                tone={getScoreTone(entry.score)}
                size="md"
                label={entry.label}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface CwvCardSpec {
  key: CwvMetricKey;
  shortLabel: string;
  fullLabel: string;
}

const CWV_CARD_SPECS: readonly CwvCardSpec[] = [
  { key: "lcpMs", shortLabel: "LCP", fullLabel: "Largest Contentful Paint" },
  { key: "cls", shortLabel: "CLS", fullLabel: "Cumulative Layout Shift" },
  { key: "tbtMs", shortLabel: "TBT", fullLabel: "Total Blocking Time" },
  { key: "fcpMs", shortLabel: "FCP", fullLabel: "First Contentful Paint" },
  { key: "siMs", shortLabel: "SI", fullLabel: "Speed Index" },
  { key: "ttfbMs", shortLabel: "TTFB", fullLabel: "Time to First Byte" },
];

const RATING_LABELS: Record<CwvRating, string> = {
  good: "Good",
  "needs-improvement": "Needs Work",
  poor: "Poor",
  unknown: "N/A",
};

const TONE_BADGE_MAP: Record<
  RadialGaugeTone,
  "success" | "warning" | "destructive" | "neutral"
> = {
  success: "success",
  warning: "warning",
  destructive: "destructive",
  neutral: "neutral",
};

const MARKER_STROKE_CLASSES: Record<RadialGaugeTone, string> = {
  success: "stroke-success",
  warning: "stroke-warning",
  destructive: "stroke-destructive",
  neutral: "stroke-muted-foreground",
};

/**
 * Six-card Core Web Vitals overview with semantic threshold band visualizers.
 */
function CoreWebVitalsGrid({ run }: { run: LighthouseRunListItem }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {CWV_CARD_SPECS.map((spec) => {
        const value = run[spec.key];
        const rating = getCwvRating(spec.key, value);
        const tone = getCwvTone(rating);
        const markerX = getCwvBarPositionPercent(spec.key, value);

        return (
          <div
            key={spec.key}
            className="border-border bg-card text-card-foreground flex flex-col gap-2 rounded-lg border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground truncate text-xs font-medium">
                {spec.shortLabel} · {spec.fullLabel}
              </span>
              <Badge variant={TONE_BADGE_MAP[tone]}>
                {RATING_LABELS[rating]}
              </Badge>
            </div>
            <div className="text-foreground text-lg font-bold tabular-nums">
              {formatCwvValue(spec.key, value)}
            </div>
            {value !== null ? (
              <div className="relative flex h-1.5 w-full items-center gap-0.5">
                <div className="bg-success/35 h-full flex-2 rounded-l-full" />
                <div className="bg-warning/35 h-full flex-1" />
                <div className="bg-destructive/35 h-full flex-1 rounded-r-full" />
                <svg
                  viewBox="0 0 100 10"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 size-full overflow-visible"
                  aria-hidden="true"
                >
                  <line
                    x1={markerX}
                    x2={markerX}
                    y1={5}
                    y2={5}
                    strokeWidth={12}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className="stroke-card"
                  />
                  <line
                    x1={markerX}
                    x2={markerX}
                    y1={5}
                    y2={5}
                    strokeWidth={8}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className={MARKER_STROKE_CLASSES[tone]}
                  />
                </svg>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

interface PhaseDisplayItem {
  key: keyof LcpPhaseBreakdown;
  label: string;
  ms: number | null;
  dotClass: string;
  fillClass: string;
}

function buildPhaseSegments(phases: LcpPhaseBreakdown): {
  items: readonly PhaseDisplayItem[];
  totalMs: number;
  rects: readonly {
    key: string;
    x: number;
    width: number;
    fillClass: string;
  }[];
} {
  const items: PhaseDisplayItem[] = [
    {
      key: "timeToFirstByteMs",
      label: "Time to First Byte (TTFB)",
      ms: phases.timeToFirstByteMs,
      dotClass: "bg-chart-1",
      fillClass: "fill-chart-1",
    },
    {
      key: "resourceLoadDelayMs",
      label: "Resource Load Delay",
      ms: phases.resourceLoadDelayMs,
      dotClass: "bg-chart-2",
      fillClass: "fill-chart-2",
    },
    {
      key: "resourceLoadDurationMs",
      label: "Resource Load Duration",
      ms: phases.resourceLoadDurationMs,
      dotClass: "bg-chart-3",
      fillClass: "fill-chart-3",
    },
    {
      key: "elementRenderDelayMs",
      label: "Element Render Delay",
      ms: phases.elementRenderDelayMs,
      dotClass: "bg-chart-4",
      fillClass: "fill-chart-4",
    },
  ];

  const positiveTotal = items.reduce(
    (sum, item) => sum + (item.ms !== null && item.ms > 0 ? item.ms : 0),
    0,
  );
  const totalMs = positiveTotal > 0 ? positiveTotal : 1;

  let cursor = 0;
  const rects: { key: string; x: number; width: number; fillClass: string }[] =
    [];
  for (const item of items) {
    if (item.ms !== null && item.ms > 0) {
      const width = Math.max(2, (item.ms / totalMs) * 100);
      rects.push({
        key: item.key,
        x: cursor,
        width: Math.min(width, 100 - cursor),
        fillClass: item.fillClass,
      });
      cursor = Math.min(100, cursor + width);
    }
  }

  return { items, totalMs, rects };
}

function AttributedLcpElementBox({ element }: { element: AttributedElement }) {
  return (
    <div className="bg-muted/40 border-border flex flex-col gap-1.5 rounded-lg border p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-foreground">Attributed LCP DOM Element</strong>
        {element.boundingRect ? (
          <Badge variant="outline">
            <span className="font-mono">
              {element.boundingRect.width}×{element.boundingRect.height}px @ (
              {element.boundingRect.left}, {element.boundingRect.top})
            </span>
          </Badge>
        ) : null}
      </div>
      <div>
        <span className="font-medium">Selector: </span>
        <code className="font-mono">{element.selector}</code>
      </div>
      {element.nodeLabel ? (
        <div>
          <span className="font-medium">Node Label: </span>
          <span>{element.nodeLabel}</span>
        </div>
      ) : null}
      {element.snippet ? (
        <pre className="bg-background border-border overflow-x-auto rounded border p-2 font-mono text-xs">
          {element.snippet}
        </pre>
      ) : null}
      {element.path || element.lhId ? (
        <div className="text-muted-foreground font-mono">
          Path: {element.path ?? "—"} · lhId: {element.lhId ?? "—"}
        </div>
      ) : null}
    </div>
  );
}

/**
 * LCP waterfall phase breakdown and attributed DOM element card.
 */
function LcpBreakdownCard({
  lcpPhases,
  lcpElement,
}: {
  lcpPhases: LcpPhaseBreakdown | null;
  lcpElement: AttributedElement | null;
}) {
  const phaseData = lcpPhases ? buildPhaseSegments(lcpPhases) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>LCP Phase Breakdown &amp; Element Attribution</CardTitle>
        <CardDescription>
          Network delivery, resource loading, and element render delay.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {phaseData ? (
            <>
              <svg
                viewBox="0 0 100 4"
                preserveAspectRatio="none"
                className="bg-muted h-2.5 w-full overflow-hidden rounded-full"
                aria-label="LCP phase waterfall"
              >
                {phaseData.rects.map((rect) => (
                  <rect
                    key={rect.key}
                    x={rect.x}
                    y={0}
                    width={rect.width}
                    height={4}
                    className={rect.fillClass}
                  />
                ))}
              </svg>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {phaseData.items.map((item) => {
                  const share =
                    item.ms !== null
                      ? Math.round((item.ms / phaseData.totalMs) * 100)
                      : null;
                  return (
                    <div
                      key={item.key}
                      className="bg-muted/40 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn("size-2.5 rounded-full", item.dotClass)}
                        />
                        <span>{item.label}</span>
                      </div>
                      <span className="font-mono tabular-nums">
                        {item.ms !== null ? (
                          <>
                            <strong>{Math.round(item.ms)} ms</strong>{" "}
                            <span className="text-muted-foreground">
                              ({share}%)
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            N/A (text element)
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              No LCP phase timing breakdown recorded.
            </p>
          )}

          {lcpElement ? <AttributedLcpElementBox element={lcpElement} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Lighthouse v13 Insight Audits list card showing metric savings and replaced audit IDs.
 */
function InsightsListCard({
  insights,
}: {
  insights: readonly LighthouseInsightItem[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Insight Audits ({insights.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            No Insight Audits recorded.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {insights.map((insight) => {
              const failing = isFailingInsight(insight);
              const savingsEntries = Object.entries(
                insight.metricSavings,
              ).filter(([, value]) => value > 0);
              return (
                <div
                  key={insight.id}
                  className="bg-muted/40 border-border flex flex-col gap-1.5 rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm">{insight.title}</strong>
                      <span className="text-muted-foreground font-mono text-xs">
                        {insight.id}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {savingsEntries.map(([metricKey, savingsValue]) => (
                        <Badge key={metricKey} variant="info">
                          {metricKey} -
                          {metricKey === "CLS"
                            ? savingsValue.toFixed(3)
                            : `${Math.round(savingsValue)} ms`}
                        </Badge>
                      ))}
                      <Badge variant={failing ? "destructive" : "success"}>
                        {insight.displayValue ??
                          (failing ? "Needs attention" : "Pass")}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {insight.description}
                  </p>
                  {insight.replacesAudits.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-muted-foreground text-xs">
                        Replaces:
                      </span>
                      {insight.replacesAudits.map((auditId) => (
                        <Badge key={auditId} variant="outline">
                          <span className="font-mono">{auditId}</span>
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosticCard({
  title,
  count,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} ({count})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <Badge variant="success">
            <CheckCircle2 className="size-3" />
            <span>{emptyLabel}</span>
          </Badge>
        ) : (
          <div className="flex flex-col gap-2">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Two-column diagnostics grid displaying CLS culprits and failed Lighthouse checks.
 */
function DiagnosticsGrid({
  clsCulprits,
  failedAudits,
}: {
  clsCulprits: readonly ClsCulprit[];
  failedAudits: readonly LighthouseFailedAudit[];
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <DiagnosticCard
        title="CLS Culprits"
        count={clsCulprits.length}
        emptyLabel="No layout shift culprits detected"
      >
        {clsCulprits.map((culprit) => (
          <div
            key={`${culprit.element.selector}-${culprit.score}`}
            className="bg-muted/40 border-border flex flex-col gap-1.5 rounded-lg border p-3 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono font-semibold">
                {culprit.element.selector}
              </code>
              <Badge variant="warning">Shift {culprit.score}</Badge>
            </div>
            {culprit.element.snippet ? (
              <pre className="bg-background border-border overflow-x-auto rounded border p-2 font-mono text-xs">
                {culprit.element.snippet}
              </pre>
            ) : null}
            {culprit.causes.map((cause) => (
              <div
                key={`${cause.cause}-${cause.url ?? ""}-${cause.selector ?? ""}`}
                className="text-muted-foreground"
              >
                • {cause.cause}
                {cause.url ? ` (${shortUrlLabel(cause.url)})` : ""}
              </div>
            ))}
          </div>
        ))}
      </DiagnosticCard>

      <DiagnosticCard
        title="Failed Checks"
        count={failedAudits.length}
        emptyLabel="Zero failed checks"
      >
        {failedAudits.map((audit) => (
          <div
            key={audit.id}
            className="bg-muted/40 border-border flex flex-col gap-1 rounded-lg border p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-xs">{audit.title}</strong>
              <div className="flex items-center gap-1">
                {audit.displayValue ? (
                  <Badge variant="outline">{audit.displayValue}</Badge>
                ) : null}
                <Badge variant="destructive">{audit.category ?? "audit"}</Badge>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">{audit.description}</p>
          </div>
        ))}
      </DiagnosticCard>
    </div>
  );
}

const MEDIAN_TABLE_COLUMNS = [
  "Iteration",
  "FCP",
  "Time to Interactive",
  "Euclidean Distance²",
  "Selection",
] as const;

/**
 * Representative Run Euclidean selection table for multi-iteration Audit Runs.
 */
function MedianBatchCard({
  medianMetadata,
}: {
  medianMetadata: LighthouseMedianMetadata | null;
}) {
  if (!medianMetadata) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Representative Run Batch Distribution ({medianMetadata.totalRuns}{" "}
          Iterations)
        </CardTitle>
        <CardDescription>
          Euclidean selection against median FCP ({medianMetadata.medianFcpMs}{" "}
          ms) and TTI ({medianMetadata.medianInteractiveMs} ms).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {MEDIAN_TABLE_COLUMNS.map((heading) => (
                <TableHead key={heading}>{heading}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {medianMetadata.runDistances.map((entry) => {
              const chosen = entry.runIndex === medianMetadata.selectedRunIndex;
              return (
                <TableRow key={entry.runIndex}>
                  <TableCell>
                    <span className="font-medium">
                      Iteration #{entry.runIndex + 1}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono tabular-nums">
                      {entry.fcpMs} ms
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono tabular-nums">
                      {entry.interactiveMs} ms
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono tabular-nums">
                      {entry.distanceSquared.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    {chosen ? (
                      <Badge variant="success">
                        <CheckCircle2 className="size-3" />
                        <span>Representative Run</span>
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        Discarded iteration
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * Full structured Audit Summary breakdown: scores, CWVs, LCP waterfall, Insight Audits, CLS culprits, and Representative Run distribution.
 */
function AuditSummaryView({ run }: { run: LighthouseRunDetail }) {
  const { summary } = run;

  return (
    <div className="flex flex-col gap-4">
      <AuditRunAlerts
        runtimeError={summary.runtimeError}
        runWarnings={summary.runWarnings}
      />

      <CategoryScoresCard run={run} />

      <Card>
        <CardHeader>
          <CardTitle>Core Web Vitals &amp; Timings</CardTitle>
        </CardHeader>
        <CardContent>
          <CoreWebVitalsGrid run={run} />
        </CardContent>
      </Card>

      <LcpBreakdownCard
        lcpPhases={summary.lcpPhases}
        lcpElement={summary.lcpElement}
      />

      <InsightsListCard insights={summary.insights} />

      <DiagnosticsGrid
        clsCulprits={summary.clsCulprits}
        failedAudits={summary.failedAudits}
      />

      <MedianBatchCard medianMetadata={summary.medianMetadata} />
    </div>
  );
}

/**
 * Sandboxed same-origin iframe rendering the saved Lighthouse HTML Report Artifact,
 * or a clear empty notice when the HTML file is missing from disk.
 */
function HtmlReportViewer({
  runId,
  url,
  hasHtmlReport,
}: {
  runId: string;
  url: string;
  hasHtmlReport: boolean;
}) {
  if (!hasHtmlReport) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileWarning />
          </EmptyMedia>
          <EmptyTitle>HTML Report Artifact unavailable</EmptyTitle>
          <EmptyDescription>
            The saved report.html file is absent from disk, while the Audit
            Summary remains intact.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const reportUrl = getLighthouseReportUrl(runId);

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border">
      <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">Lighthouse v13 Standalone Report</Badge>
          <span className="text-muted-foreground text-xs">
            Sandboxed viewer ({shortUrlLabel(url)})
          </span>
        </div>
        <a
          href={reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="border-border bg-background text-foreground hover:bg-muted inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors"
        >
          <ExternalLink className="size-3.5" />
          <span>New Window</span>
        </a>
      </div>
      <iframe
        src={reportUrl}
        sandbox="allow-scripts allow-popups allow-downloads"
        title="Lighthouse HTML Report"
        className="bg-background h-160 min-h-96 w-full border-0"
      />
    </div>
  );
}

/**
 * Renders standardized metadata badges (device, throttling, batch, redirect) for an Audit Run.
 */
function RunMetadataBadges({
  run,
  medianMetadata,
  className,
}: {
  run: LighthouseRunListItem;
  medianMetadata?: LighthouseMedianMetadata | null;
  className?: string;
}) {
  const redirected = Boolean(run.finalUrl && run.finalUrl !== run.url);
  const DeviceIcon = run.formFactor === "mobile" ? Smartphone : Monitor;

  return (
    <div
      data-slot="run-metadata-badges"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      <Badge variant="neutral">
        <DeviceIcon className="size-3" />
        <span>{FORM_FACTOR_LABELS[run.formFactor]}</span>
      </Badge>
      <Badge variant="outline">{run.throttlingMethod}</Badge>
      {medianMetadata ? (
        <Badge variant="info">
          <Layers className="size-3" />
          <span>
            Representative Run · {medianMetadata.totalRuns} iterations
          </span>
        </Badge>
      ) : null}
      {redirected ? (
        <Badge variant="warning">
          <ArrowRight className="size-3" />
          <span>Redirected to {shortUrlLabel(run.finalUrl)}</span>
        </Badge>
      ) : null}
    </div>
  );
}

function RunDetailLoadingSkeleton({
  variant,
}: {
  variant: "compact" | "page";
}) {
  const compact = variant === "compact";
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className={compact ? "h-16 w-full" : "h-20 w-full"} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Skeleton className={compact ? "h-24 w-full" : "h-28 w-full"} />
        <Skeleton className={compact ? "h-24 w-full" : "h-28 w-full"} />
        <Skeleton className={compact ? "h-24 w-full" : "h-28 w-full"} />
        <Skeleton className={compact ? "h-24 w-full" : "h-28 w-full"} />
      </div>
      <Skeleton className={compact ? "h-48 w-full" : "h-64 w-full"} />
    </div>
  );
}

/**
 * Shared Audit Run detail body handling loading skeleton, error retry state, metadata, and Summary/HTML Report tabs.
 */
export function RunDetailBody({
  isPending,
  errorMessage,
  run,
  tab,
  variant = "page",
  onTabChange,
  onRetry,
}: {
  isPending: boolean;
  errorMessage: string | null;
  run: LighthouseRunDetail | undefined;
  tab: "summary" | "report";
  variant?: "compact" | "page";
  onTabChange: (nextTab: unknown) => void;
  onRetry: () => void;
}) {
  if (errorMessage) {
    return (
      <LighthouseEmptyNotice
        icon={<AlertCircle />}
        title="Unable to load Audit Run"
        description={errorMessage}
        action={
          variant === "compact" ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" onClick={onRetry}>
                Retry
              </Button>
              <Link
                href={buildHistoryUrl()}
                className="border-border bg-background text-foreground hover:bg-muted inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition-colors"
              >
                Back to Audit History
              </Link>
            </div>
          )
        }
      />
    );
  }

  if (isPending || !run) {
    return <RunDetailLoadingSkeleton variant={variant} />;
  }

  return (
    <Tabs value={tab} onValueChange={onTabChange}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <RunMetadataBadges
            run={run}
            medianMetadata={run.summary.medianMetadata}
          />
          {variant === "page" ? (
            <>
              <h1 className="text-foreground text-lg font-semibold tracking-tight">
                {run.url}
              </h1>
              <p className="text-muted-foreground text-xs">
                {formatTimestamp(run.createdAt)} · Duration{" "}
                {formatDurationMs(run.durationMs)} · ID{" "}
                <span className="font-mono" title={run.id}>
                  {shortRunId(run.id)}
                </span>
              </p>
            </>
          ) : (
            <div className="text-muted-foreground text-xs">
              Duration {formatDurationMs(run.durationMs)} · ID{" "}
              <span className="font-mono" title={run.id}>
                {shortRunId(run.id)}
              </span>
            </div>
          )}
        </div>

        <TabsList>
          <TabsTrigger value="summary">Audit Summary</TabsTrigger>
          <TabsTrigger value="report">HTML Report</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="summary">
        <div className="pt-2">
          <AuditSummaryView run={run} />
        </div>
      </TabsContent>
      <TabsContent value="report">
        <div className="pt-2">
          <HtmlReportViewer
            runId={run.id}
            url={run.url}
            hasHtmlReport={run.hasHtmlReport}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
