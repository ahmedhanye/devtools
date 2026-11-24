"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import type * as RechartsModule from "recharts";
import type {
  InsightDiffItem,
  LighthouseDiffResponse,
  LighthouseInsightItem,
  LighthouseRunListItem,
} from "@devtools/lighthouse/schemas";
import {
  AlertTriangle,
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  GitCompare,
  Pin,
  Plus,
  X,
} from "lucide-react";
import {
  buildHistoryUrl,
  computeDelta,
  formatCwvValue,
  formatShortTimestamp,
  formatTimestamp,
  getScoreTone,
  LighthouseEmptyNotice,
  LighthouseHeader,
  MetricDeltaBadge,
  shortUrlLabel,
} from "@/entities/lighthouse-run";
import { RunInspectorSheet } from "@/features/lighthouse/inspect-run";
import { TriggerAuditSheet } from "@/features/lighthouse/trigger-audit";
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
  type ChartConfig,
  ChartContainer,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  MultiSelectCombobox,
  OptionSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import {
  buildChartInspectHandlers,
  type CompareDeviceRule,
  type CompareSortDir,
  type CompareSortKey,
} from "../model/compare-helpers";
import { useCompareDiff } from "../model/use-compare-diff";
import {
  type CompareBuilderModel,
  useCompareController,
} from "../model/use-compare-state";

type CompareChartMode = "scores" | "cwv" | "single";
type CompareChartMetric =
  "performanceScore" | "accessibilityScore" | "lcpMs" | "cls";
type CompareChartType = "area" | "bar";

type SeriesKey =
  | "performanceScore"
  | "accessibilityScore"
  | "bestPracticesScore"
  | "seoScore"
  | "lcpMs"
  | "siMs"
  | "fcpMs"
  | "tbtMs"
  | "cls";

interface SeriesMeta {
  key: SeriesKey;
  label: string;
  color: string;
  gradientId: string;
  dotClass: string;
  higherIsBetter: boolean;
}

interface SingleMetricMeta {
  key: CompareChartMetric;
  label: string;
  isScore: boolean;
  higherIsBetter: boolean;
  target: number;
}

type CompareTrendDatum = Pick<LighthouseRunListItem, SeriesKey> & {
  runId: string;
  axisLabel: string;
  run: LighthouseRunListItem;
};

const MULTI_SCORE_SERIES: readonly SeriesMeta[] = [
  {
    key: "performanceScore",
    label: "Performance",
    color: "var(--color-chart-1)",
    gradientId: "compare-grad-perf",
    dotClass: "bg-chart-1",
    higherIsBetter: true,
  },
  {
    key: "accessibilityScore",
    label: "Accessibility",
    color: "var(--color-chart-5)",
    gradientId: "compare-grad-a11y",
    dotClass: "bg-chart-5",
    higherIsBetter: true,
  },
  {
    key: "bestPracticesScore",
    label: "Best Practices",
    color: "var(--color-chart-2)",
    gradientId: "compare-grad-bp",
    dotClass: "bg-chart-2",
    higherIsBetter: true,
  },
  {
    key: "seoScore",
    label: "SEO",
    color: "var(--color-chart-4)",
    gradientId: "compare-grad-seo",
    dotClass: "bg-chart-4",
    higherIsBetter: true,
  },
];

const MULTI_CWV_SERIES: readonly SeriesMeta[] = [
  {
    key: "lcpMs",
    label: "LCP (ms)",
    color: "var(--color-chart-1)",
    gradientId: "compare-grad-lcp",
    dotClass: "bg-chart-1",
    higherIsBetter: false,
  },
  {
    key: "siMs",
    label: "Speed Index (ms)",
    color: "var(--color-chart-3)",
    gradientId: "compare-grad-si",
    dotClass: "bg-chart-3",
    higherIsBetter: false,
  },
  {
    key: "fcpMs",
    label: "FCP (ms)",
    color: "var(--color-chart-5)",
    gradientId: "compare-grad-fcp",
    dotClass: "bg-chart-5",
    higherIsBetter: false,
  },
  {
    key: "tbtMs",
    label: "TBT (ms)",
    color: "var(--color-chart-4)",
    gradientId: "compare-grad-tbt",
    dotClass: "bg-chart-4",
    higherIsBetter: false,
  },
];

const SINGLE_META_BY_KEY: Record<CompareChartMetric, SingleMetricMeta> = {
  performanceScore: {
    key: "performanceScore",
    label: "Performance",
    isScore: true,
    higherIsBetter: true,
    target: 90,
  },
  accessibilityScore: {
    key: "accessibilityScore",
    label: "Accessibility",
    isScore: true,
    higherIsBetter: true,
    target: 90,
  },
  lcpMs: {
    key: "lcpMs",
    label: "LCP (ms)",
    isScore: false,
    higherIsBetter: false,
    target: 2500,
  },
  cls: {
    key: "cls",
    label: "CLS",
    isScore: false,
    higherIsBetter: false,
    target: 0.1,
  },
};

const SINGLE_METRICS: readonly SingleMetricMeta[] =
  Object.values(SINGLE_META_BY_KEY);

const SINGLE_SERIES_META_BY_KEY: Record<CompareChartMetric, SeriesMeta> = {
  performanceScore: {
    key: "performanceScore",
    label: "Performance",
    color: "var(--color-chart-1)",
    gradientId: "compare-grad-single-perf",
    dotClass: "bg-chart-1",
    higherIsBetter: true,
  },
  accessibilityScore: {
    key: "accessibilityScore",
    label: "Accessibility",
    color: "var(--color-chart-5)",
    gradientId: "compare-grad-single-a11y",
    dotClass: "bg-chart-5",
    higherIsBetter: true,
  },
  lcpMs: {
    key: "lcpMs",
    label: "LCP (ms)",
    color: "var(--color-chart-1)",
    gradientId: "compare-grad-single-lcp",
    dotClass: "bg-chart-1",
    higherIsBetter: false,
  },
  cls: {
    key: "cls",
    label: "CLS",
    color: "var(--color-chart-1)",
    gradientId: "compare-grad-single-cls",
    dotClass: "bg-chart-1",
    higherIsBetter: false,
  },
};

const SCORE_TONE_DOT_CLASS: Record<RadialGaugeTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  neutral: "bg-muted-foreground",
};

const SCORE_Y_DOMAIN: [number, number] = [0, 100];
const AUTO_Y_DOMAIN: [number, "auto"] = [0, "auto"];
const CHART_MARGIN = { left: 8, right: 16, top: 12, bottom: 4 };
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const SINGLE_DOT_CONFIG = { r: 3.5, strokeWidth: 1.5 };
const ACTIVE_DOT_CONFIG = { r: 5, strokeWidth: 2 };

const DEFAULT_ENABLED_SERIES: Record<SeriesKey, boolean> = {
  performanceScore: true,
  accessibilityScore: true,
  bestPracticesScore: true,
  seoScore: true,
  lcpMs: true,
  siMs: true,
  fcpMs: true,
  tbtMs: true,
  cls: true,
};

function formatSeriesValue(key: SeriesKey, value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (key === "cls") {
    return value.toFixed(3);
  }
  return key.endsWith("Ms")
    ? `${Math.round(value)} ms`
    : String(Math.round(value));
}

function formatSeriesDelta(
  key: SeriesKey,
  value: number | null,
  baselineValue: number | null,
  higherIsBetter: boolean,
): { text: string; toneClass: string } | null {
  const delta = computeDelta(value, baselineValue);
  if (delta === null) {
    return null;
  }
  if (delta === 0) {
    return { text: "0", toneClass: "text-muted-foreground" };
  }
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const sign = delta > 0 ? "+" : "";
  const text =
    key === "cls"
      ? `${sign}${delta.toFixed(3)}`
      : key.endsWith("Ms")
        ? `${sign}${Math.round(delta)} ms`
        : `${sign}${Math.round(delta)}`;
  return {
    text,
    toneClass: improved
      ? "text-success-subtle-foreground"
      : "text-destructive-subtle-foreground",
  };
}

function extractRunIdFromPayload(payload: unknown): string | null {
  const first: unknown = Array.isArray(payload) ? payload[0] : undefined;
  const inner: unknown =
    typeof first === "object" && first !== null && "payload" in first
      ? first.payload
      : undefined;
  return typeof inner === "object" &&
    inner !== null &&
    "runId" in inner &&
    typeof inner.runId === "string"
    ? inner.runId
    : null;
}

function TooltipMetricRow({
  dotClass,
  label,
  valueText,
  delta,
}: {
  dotClass: string;
  label: string;
  valueText: string | number;
  delta: { text: string; toneClass: string } | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5">
        <span className={cn("size-2 shrink-0 rounded-full", dotClass)} />
        <span>{label}</span>
      </span>
      <span className="flex items-center gap-1.5 tabular-nums">
        <strong className="font-semibold">{valueText}</strong>
        {delta ? (
          <span className={cn("font-semibold", delta.toneClass)}>
            {delta.text}
          </span>
        ) : null}
      </span>
    </div>
  );
}

interface CompareTrendTooltipProps {
  active?: boolean;
  payload?: readonly unknown[];
  runsById: ReadonlyMap<string, LighthouseRunListItem>;
  mode: CompareChartMode;
  singleMetric: CompareChartMetric;
  visibleSeries: readonly SeriesMeta[];
  baselineRun: LighthouseRunListItem | null;
}

function SingleMetricTooltipRows({
  run,
  baselineRun,
  isBaseline,
  singleMetric,
}: {
  run: LighthouseRunListItem;
  baselineRun: LighthouseRunListItem | null;
  isBaseline: boolean;
  singleMetric: CompareChartMetric;
}) {
  const activeMeta = SINGLE_META_BY_KEY[singleMetric];
  const summaryScoreRows: readonly {
    key: CompareChartMetric | "bestPracticesScore" | "seoScore";
    label: string;
    value: number | null;
  }[] = [
    {
      key: "performanceScore",
      label: "Performance",
      value: run.performanceScore,
    },
    {
      key: "accessibilityScore",
      label: "Accessibility",
      value: run.accessibilityScore,
    },
    {
      key: "bestPracticesScore",
      label: "Best Practices",
      value: run.bestPracticesScore,
    },
    { key: "seoScore", label: "SEO", value: run.seoScore },
  ];

  return (
    <div className="flex flex-col gap-1">
      {!activeMeta.isScore ? (
        <TooltipMetricRow
          dotClass={SINGLE_SERIES_META_BY_KEY[singleMetric].dotClass}
          label={activeMeta.label}
          valueText={formatSeriesValue(singleMetric, run[singleMetric])}
          delta={
            !isBaseline && baselineRun
              ? formatSeriesDelta(
                  singleMetric,
                  run[singleMetric],
                  baselineRun[singleMetric],
                  activeMeta.higherIsBetter,
                )
              : null
          }
        />
      ) : null}
      {summaryScoreRows.map((row) => {
        const tone = getScoreTone(row.value);
        const activeDelta =
          !isBaseline && row.key === singleMetric && baselineRun
            ? formatSeriesDelta(row.key, row.value, baselineRun[row.key], true)
            : null;
        return (
          <TooltipMetricRow
            key={row.key}
            dotClass={SCORE_TONE_DOT_CLASS[tone]}
            label={row.label}
            valueText={row.value ?? "—"}
            delta={activeDelta}
          />
        );
      })}
    </div>
  );
}

function CompareTrendTooltip({
  active,
  payload,
  runsById,
  mode,
  singleMetric,
  visibleSeries,
  baselineRun,
}: CompareTrendTooltipProps) {
  const runId = active ? extractRunIdFromPayload(payload) : null;
  const run = runId ? runsById.get(runId) : undefined;
  if (!run) {
    return null;
  }
  const isBaseline = baselineRun !== null && run.id === baselineRun.id;

  return (
    <div className="bg-popover text-popover-foreground border-border w-64 rounded-lg border p-3 text-xs shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{formatTimestamp(run.createdAt)}</span>
        {isBaseline ? (
          <Badge variant="info" size="sm">
            Baseline
          </Badge>
        ) : null}
      </div>

      <div className="text-muted-foreground border-border mt-0.5 mb-2 border-b pb-1.5">
        {shortUrlLabel(run.url)} · {run.formFactor} · {run.throttlingMethod}
      </div>

      {mode === "single" ? (
        <SingleMetricTooltipRows
          run={run}
          baselineRun={baselineRun}
          isBaseline={isBaseline}
          singleMetric={singleMetric}
        />
      ) : (
        <div className="flex flex-col gap-1">
          {visibleSeries.map((series) => {
            const value = run[series.key];
            const delta =
              !isBaseline && baselineRun
                ? formatSeriesDelta(
                    series.key,
                    value,
                    baselineRun[series.key],
                    series.higherIsBetter,
                  )
                : null;
            return (
              <TooltipMetricRow
                key={series.key}
                dotClass={series.dotClass}
                label={series.label}
                valueText={formatSeriesValue(series.key, value)}
                delta={delta}
              />
            );
          })}
        </div>
      )}

      <div className="text-muted-foreground border-border mt-2 flex items-center justify-between border-t pt-1.5 tabular-nums">
        <span>
          {mode === "cwv"
            ? `Perf ${run.performanceScore ?? "—"} · CLS ${formatCwvValue("cls", run.cls)}`
            : `LCP ${formatCwvValue("lcpMs", run.lcpMs)} · CLS ${formatCwvValue("cls", run.cls)}`}
        </span>
        <span>Click to inspect</span>
      </div>
    </div>
  );
}

interface CompareChartCanvasProps {
  chartConfig: ChartConfig;
  chartData: readonly CompareTrendDatum[];
  mode: CompareChartMode;
  singleMetric: CompareChartMetric;
  chartType: CompareChartType;
  visibleSeries: readonly SeriesMeta[];
  baselineRun: LighthouseRunListItem | null;
  onAreaChartClick: (state: unknown) => void;
  onBarClick: (data: unknown) => void;
}

function buildCommonChartGuides({
  recharts,
  isScoreAxis,
  mode,
  singleTarget,
  baselineSingleValue,
  renderTooltipContent,
}: {
  recharts: typeof RechartsModule;
  isScoreAxis: boolean;
  mode: CompareChartMode;
  singleTarget: number;
  baselineSingleValue: number | null;
  renderTooltipContent: (tooltipProps: {
    active?: boolean;
    payload?: readonly unknown[];
  }) => ReactNode;
}) {
  const { CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } = recharts;
  return (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis
        dataKey="axisLabel"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
      />
      <YAxis
        domain={isScoreAxis ? SCORE_Y_DOMAIN : AUTO_Y_DOMAIN}
        tickLine={false}
        axisLine={false}
        width={48}
      />
      <Tooltip content={renderTooltipContent} />
      {mode === "scores" ? (
        <ReferenceLine
          y={90}
          stroke="var(--color-success)"
          strokeDasharray="4 4"
          strokeOpacity={0.45}
        />
      ) : null}
      {mode === "single" ? (
        <ReferenceLine
          y={singleTarget}
          stroke="var(--color-success)"
          strokeDasharray="4 4"
          strokeOpacity={0.65}
        />
      ) : null}
      {mode === "single" && baselineSingleValue !== null ? (
        <ReferenceLine
          y={baselineSingleValue}
          stroke="var(--color-chart-2)"
          strokeDasharray="6 3"
        />
      ) : null}
    </>
  );
}

function InnerCompareChart({
  recharts,
  chartConfig,
  chartData,
  mode,
  singleMetric,
  chartType,
  visibleSeries,
  baselineRun,
  onAreaChartClick,
  onBarClick,
}: CompareChartCanvasProps & { recharts: typeof RechartsModule }) {
  const { Area, AreaChart, Bar, BarChart } = recharts;

  const singleMeta = SINGLE_META_BY_KEY[singleMetric];
  const isScoreAxis =
    mode === "scores" || (mode === "single" && singleMeta.isScore);
  const baselineSingleValue = baselineRun ? baselineRun[singleMetric] : null;

  const runsById = useMemo(
    () => new Map(chartData.map((datum) => [datum.runId, datum.run])),
    [chartData],
  );

  const renderTooltipContent = useCallback(
    (tooltipProps: { active?: boolean; payload?: readonly unknown[] }) => (
      <CompareTrendTooltip
        active={tooltipProps.active}
        payload={tooltipProps.payload}
        runsById={runsById}
        mode={mode}
        singleMetric={singleMetric}
        visibleSeries={visibleSeries}
        baselineRun={baselineRun}
      />
    ),
    [baselineRun, mode, runsById, singleMetric, visibleSeries],
  );

  const commonAxesAndGuides = buildCommonChartGuides({
    recharts,
    isScoreAxis,
    mode,
    singleTarget: singleMeta.target,
    baselineSingleValue,
    renderTooltipContent,
  });

  const mutableData = chartData.slice();
  const areaDot = mode === "single" ? SINGLE_DOT_CONFIG : false;

  return (
    <ChartContainer config={chartConfig} className="h-72 w-full">
      {chartType === "area" ? (
        <AreaChart
          data={mutableData}
          margin={CHART_MARGIN}
          onClick={onAreaChartClick}
        >
          <defs>
            {visibleSeries.map((series) => (
              <linearGradient
                key={series.gradientId}
                id={series.gradientId}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={series.color} stopOpacity={0.28} />
                <stop
                  offset="95%"
                  stopColor={series.color}
                  stopOpacity={0.02}
                />
              </linearGradient>
            ))}
          </defs>
          {commonAxesAndGuides}
          {visibleSeries.map((series) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              fill={`url(#${series.gradientId})`}
              strokeWidth={2}
              connectNulls
              isAnimationActive={false}
              dot={areaDot}
              activeDot={ACTIVE_DOT_CONFIG}
            />
          ))}
        </AreaChart>
      ) : (
        <BarChart data={mutableData} margin={CHART_MARGIN}>
          {commonAxesAndGuides}
          {visibleSeries.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              fill={series.color}
              radius={BAR_RADIUS}
              isAnimationActive={false}
              onClick={onBarClick}
              className="cursor-pointer"
            />
          ))}
        </BarChart>
      )}
    </ChartContainer>
  );
}

const LazyRechartsCanvas = lazy(() =>
  import("recharts").then((recharts) => ({
    default: (props: CompareChartCanvasProps) => (
      <InnerCompareChart
        recharts={recharts}
        chartConfig={props.chartConfig}
        chartData={props.chartData}
        mode={props.mode}
        singleMetric={props.singleMetric}
        chartType={props.chartType}
        visibleSeries={props.visibleSeries}
        baselineRun={props.baselineRun}
        onAreaChartClick={props.onAreaChartClick}
        onBarClick={props.onBarClick}
      />
    ),
  })),
);

function SeriesFilterChip({
  series,
  enabled,
  onToggle,
}: {
  series: SeriesMeta;
  enabled: boolean;
  onToggle: (key: SeriesKey) => void;
}) {
  const handleClick = useCallback(() => {
    onToggle(series.key);
  }, [onToggle, series.key]);

  return (
    <Button
      type="button"
      size="xs"
      variant={enabled ? "outline" : "ghost"}
      aria-pressed={enabled}
      onClick={handleClick}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          enabled ? series.dotClass : "bg-muted-foreground/40",
        )}
      />
      <span className={enabled ? undefined : "text-muted-foreground"}>
        {series.label}
      </span>
    </Button>
  );
}

function buildCompareTrendData(
  runs: readonly LighthouseRunListItem[],
): CompareTrendDatum[] {
  return runs.map((run) => ({
    runId: run.id,
    axisLabel: formatShortTimestamp(run.createdAt),
    run,
    performanceScore: run.performanceScore,
    accessibilityScore: run.accessibilityScore,
    bestPracticesScore: run.bestPracticesScore,
    seoScore: run.seoScore,
    lcpMs: run.lcpMs,
    siMs: run.siMs,
    fcpMs: run.fcpMs,
    tbtMs: run.tbtMs,
    cls: run.cls,
  }));
}

function CompareTrendSubBar({
  mode,
  singleMetric,
  onSingleMetricChange,
  activeSeriesGroup,
  enabledSeries,
  onToggleSeries,
}: {
  mode: CompareChartMode;
  singleMetric: CompareChartMetric;
  onSingleMetricChange: (value: string) => void;
  activeSeriesGroup: readonly SeriesMeta[];
  enabledSeries: Record<SeriesKey, boolean>;
  onToggleSeries: (key: SeriesKey) => void;
}) {
  if (mode === "single") {
    return (
      <div className="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2 border-t px-6 py-2.5">
        <Tabs value={singleMetric} onValueChange={onSingleMetricChange}>
          <TabsList>
            {SINGLE_METRICS.map((metric) => (
              <TabsTrigger key={metric.key} value={metric.key}>
                {metric.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span className="text-muted-foreground text-xs">
          Target &amp; baseline guides active
        </span>
      </div>
    );
  }

  return (
    <div className="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2 border-t px-6 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {activeSeriesGroup.map((series) => (
          <SeriesFilterChip
            key={series.key}
            series={series}
            enabled={enabledSeries[series.key]}
            onToggle={onToggleSeries}
          />
        ))}
      </div>
      <span className="text-muted-foreground text-xs">
        Click chips to show or hide series
      </span>
    </div>
  );
}

function CompareTrendChart({
  runs,
  baselineRun,
  onInspectRun,
}: {
  runs: readonly LighthouseRunListItem[];
  baselineRun: LighthouseRunListItem | null;
  onInspectRun: (runId: string) => void;
}) {
  const [mode, setMode] = useState<CompareChartMode>("scores");
  const [singleMetric, setSingleMetric] =
    useState<CompareChartMetric>("performanceScore");
  const [chartType, setChartType] = useState<CompareChartType>("area");
  const [enabledSeries, setEnabledSeries] = useState<
    Record<SeriesKey, boolean>
  >(DEFAULT_ENABLED_SERIES);

  const activeSeriesGroup = useMemo<readonly SeriesMeta[]>(() => {
    if (mode === "scores") {
      return MULTI_SCORE_SERIES;
    }
    if (mode === "cwv") {
      return MULTI_CWV_SERIES;
    }
    return [SINGLE_SERIES_META_BY_KEY[singleMetric]];
  }, [mode, singleMetric]);

  const visibleSeries = useMemo<readonly SeriesMeta[]>(() => {
    if (mode === "single") {
      return activeSeriesGroup;
    }
    const filtered = activeSeriesGroup.filter(
      (series) => enabledSeries[series.key],
    );
    return filtered.length > 0 ? filtered : activeSeriesGroup.slice(0, 1);
  }, [activeSeriesGroup, enabledSeries, mode]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const entries: ChartConfig = {};
    for (const series of visibleSeries) {
      entries[series.key] = {
        label: series.label,
        color: series.color,
      };
    }
    return entries;
  }, [visibleSeries]);

  const chartData = useMemo(() => buildCompareTrendData(runs), [runs]);

  const handleToggleSeries = useCallback(
    (key: SeriesKey) => {
      setEnabledSeries((prev) => {
        const group = mode === "scores" ? MULTI_SCORE_SERIES : MULTI_CWV_SERIES;
        const enabledCount = group.filter((s) => prev[s.key]).length;
        if (prev[key] && enabledCount <= 1) {
          return prev;
        }
        return { ...prev, [key]: !prev[key] };
      });
    },
    [mode],
  );

  const handleModeChange = useCallback((value: string) => {
    if (value === "scores" || value === "cwv" || value === "single") {
      setMode(value);
    }
  }, []);

  const handleChartTypeChange = useCallback((value: string) => {
    if (value === "area" || value === "bar") {
      setChartType(value);
    }
  }, []);

  const handleSingleMetricChange = useCallback((value: string) => {
    if (
      value === "performanceScore" ||
      value === "accessibilityScore" ||
      value === "lcpMs" ||
      value === "cls"
    ) {
      setSingleMetric(value);
    }
  }, []);

  const { onAreaChartClick, onBarClick } = useMemo(
    () => buildChartInspectHandlers(chartData, onInspectRun),
    [chartData, onInspectRun],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Trend Across Selected Runs ({runs.length})</CardTitle>
            <CardDescription>
              Compare multiple categories together, toggle series, or click a
              point/bar to inspect.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={mode} onValueChange={handleModeChange}>
              <TabsList>
                <TabsTrigger value="scores">All 4 Scores</TabsTrigger>
                <TabsTrigger value="cwv">CWV Timings</TabsTrigger>
                <TabsTrigger value="single">Single Metric</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={chartType} onValueChange={handleChartTypeChange}>
              <TabsList>
                <TabsTrigger value="area">Area</TabsTrigger>
                <TabsTrigger value="bar">Bars</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </CardHeader>

      <CompareTrendSubBar
        mode={mode}
        singleMetric={singleMetric}
        onSingleMetricChange={handleSingleMetricChange}
        activeSeriesGroup={activeSeriesGroup}
        enabledSeries={enabledSeries}
        onToggleSeries={handleToggleSeries}
      />

      <CardContent>
        {chartData.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No Audit Runs selected</EmptyTitle>
              <EmptyDescription>
                Include one or more runs from the Compare Builder to chart
                trends.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Suspense fallback={<Skeleton className="h-72 w-full" />}>
            <LazyRechartsCanvas
              chartConfig={chartConfig}
              chartData={chartData}
              mode={mode}
              singleMetric={singleMetric}
              chartType={chartType}
              visibleSeries={visibleSeries}
              baselineRun={baselineRun}
              onAreaChartClick={onAreaChartClick}
              onBarClick={onBarClick}
            />
          </Suspense>
        )}
      </CardContent>
    </Card>
  );
}

const DEVICE_RULE_ITEMS: Record<CompareDeviceRule, string> = {
  all: "All Devices",
  mobile: "Mobile Only",
  desktop: "Desktop Only",
};

const DEVICE_RULE_OPTIONS = [
  { value: "all", label: "All Devices" },
  { value: "mobile", label: "Mobile Only" },
  { value: "desktop", label: "Desktop Only" },
] as const;

function SelectedRunSidebarItem({
  run,
  isBaseline,
  onSetBaseline,
  onRemove,
}: {
  run: LighthouseRunListItem;
  isBaseline: boolean;
  onSetBaseline: (runId: string) => void;
  onRemove: (runId: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2 py-1.5",
        isBaseline
          ? "border-info-border bg-info-subtle"
          : "border-border bg-muted/30",
      )}
    >
      <Badge variant={getScoreTone(run.performanceScore)}>
        {run.performanceScore ?? "—"}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="text-foreground truncate text-xs font-medium">
          {shortUrlLabel(run.url)}
        </div>
        <div className="text-muted-foreground truncate text-xs">
          {formatShortTimestamp(run.createdAt)} · {run.formFactor}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isBaseline ? (
          <Badge variant="info">Base</Badge>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onSetBaseline(run.id)}
          >
            Set Base
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${shortUrlLabel(run.url)} from comparison`}
          onClick={() => onRemove(run.id)}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function AddSpecificRunRow({
  run,
  onAdd,
}: {
  run: LighthouseRunListItem;
  onAdd: (runId: string) => void;
}) {
  const handleClick = useCallback(() => {
    onAdd(run.id);
  }, [onAdd, run.id]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="hover:bg-accent flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-xs transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="text-foreground truncate font-medium">
          {shortUrlLabel(run.url)}
        </div>
        <div className="text-muted-foreground">
          {formatShortTimestamp(run.createdAt)} · {run.formFactor}
        </div>
      </div>
      <Badge variant={getScoreTone(run.performanceScore)}>
        {run.performanceScore ?? "—"}
      </Badge>
    </button>
  );
}

function QuickPresetsSection({
  topPresetUrls,
  distinctUrlsCount,
  totalAvailableCount,
  onPresetUrl,
  onPresetLatestPerUrl,
  onPresetAllRuns,
}: {
  topPresetUrls: readonly { url: string; label: string; count: number }[];
  distinctUrlsCount: number;
  totalAvailableCount: number;
  onPresetUrl: (url: string) => void;
  onPresetLatestPerUrl: () => void;
  onPresetAllRuns: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-foreground text-xs font-medium">Quick Presets</span>
      <div className="grid grid-cols-2 gap-1.5">
        {topPresetUrls.map((entry) => (
          <Button
            key={entry.url}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPresetUrl(entry.url)}
            className="w-full justify-between"
          >
            <span className="truncate">{entry.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {entry.count}
            </span>
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPresetLatestPerUrl}
          className="w-full justify-between"
        >
          <span>Latest / URL</span>
          <span className="text-muted-foreground tabular-nums">
            {distinctUrlsCount}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPresetAllRuns}
          className="w-full justify-between"
        >
          <span>All Runs</span>
          <span className="text-muted-foreground tabular-nums">
            {totalAvailableCount}
          </span>
        </Button>
      </div>
    </div>
  );
}

function SidebarScrollList({
  variant,
  title,
  count,
  emptyMessage,
  isEmpty,
  children,
}: {
  variant: "popover" | "sidebar";
  title: string;
  count?: number;
  emptyMessage: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  const isPopover = variant === "popover";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            isPopover
              ? "text-foreground text-xs font-semibold"
              : "text-foreground text-xs font-medium"
          }
        >
          {title}
        </span>
        {count !== undefined ? <Badge variant="neutral">{count}</Badge> : null}
      </div>
      {isEmpty ? (
        <p className="text-muted-foreground text-xs">{emptyMessage}</p>
      ) : (
        <div
          className={
            isPopover
              ? "max-h-56 scrollbar-thin overflow-y-auto pe-2"
              : "max-h-64 scrollbar-thin overflow-y-auto pe-2"
          }
        >
          <div
            className={
              isPopover ? "flex flex-col gap-1" : "flex flex-col gap-1.5"
            }
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function AddRunPopover({
  unaddedRuns,
  onAddSpecificRun,
}: {
  unaddedRuns: readonly LighthouseRunListItem[];
  onAddSpecificRun: (runId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const handleAddAndClose = useCallback(
    (runId: string) => {
      onAddSpecificRun(runId);
      setOpen(false);
    },
    [onAddSpecificRun],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button type="button" variant="outline" size="sm" />}
      >
        <Plus className="size-3.5" />
        <span>Add Run</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <SidebarScrollList
          variant="popover"
          title="Add Audit Run"
          emptyMessage="All matching runs are already included."
          isEmpty={unaddedRuns.length === 0}
        >
          {unaddedRuns.map((run) => (
            <AddSpecificRunRow
              key={run.id}
              run={run}
              onAdd={handleAddAndClose}
            />
          ))}
        </SidebarScrollList>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Sticky left sidebar for building and pinning runs in the comparison set.
 */
function CompareBuilderSidebar({ builder }: { builder: CompareBuilderModel }) {
  return (
    <aside className="w-full shrink-0 xl:sticky xl:top-4 xl:w-88">
      <Card>
        <CardHeader>
          <CardTitle>Compare Builder</CardTitle>
          <CardDescription>
            {builder.chronoRuns.length}{" "}
            {builder.chronoRuns.length === 1 ? "run" : "runs"} included in
            comparison
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <QuickPresetsSection
              topPresetUrls={builder.topPresetUrls}
              distinctUrlsCount={builder.distinctUrlsCount}
              totalAvailableCount={builder.totalAvailableCount}
              onPresetUrl={builder.onPresetUrl}
              onPresetLatestPerUrl={builder.onPresetLatestPerUrl}
              onPresetAllRuns={builder.onPresetAllRuns}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-foreground text-xs font-medium">
                Include by URL
              </span>
              <MultiSelectCombobox
                options={builder.urlComboboxOptions}
                selectedValues={builder.selectedUrls}
                onSelectedValuesChange={builder.onUrlsChange}
                placeholder="Select audited URLs"
                searchPlaceholder="Filter URLs..."
                selectAllLabel="Select all"
                onlyActionLabel="Only"
                footerText={`${builder.chronoRuns.length} matching ${builder.chronoRuns.length === 1 ? "run" : "runs"}`}
                ariaLabel="Include runs by URL"
              />
            </div>

            <div className="flex items-center gap-2">
              <OptionSelect
                ariaLabel="Filter comparison by device"
                triggerClassName="flex-1"
                value={builder.deviceRule}
                items={DEVICE_RULE_ITEMS}
                options={DEVICE_RULE_OPTIONS}
                onValueChange={builder.onDeviceRuleChange}
              />

              <AddRunPopover
                unaddedRuns={builder.unaddedRuns}
                onAddSpecificRun={builder.onAddSpecificRun}
              />
            </div>

            <SidebarScrollList
              variant="sidebar"
              title="Selected Runs"
              count={builder.chronoRuns.length}
              emptyMessage="No runs selected. Choose a preset or URL above."
              isEmpty={builder.chronoRuns.length === 0}
            >
              {builder.chronoRuns.map((run) => (
                <SelectedRunSidebarItem
                  key={run.id}
                  run={run}
                  isBaseline={run.id === builder.baselineId}
                  onSetBaseline={builder.onSetBaseline}
                  onRemove={builder.onRemoveRun}
                />
              ))}
            </SidebarScrollList>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

const SORTABLE_COLUMNS: readonly {
  key: CompareSortKey;
  label: string;
}[] = [
  { key: "accessibilityScore", label: "A11y" },
  { key: "bestPracticesScore", label: "BP" },
  { key: "seoScore", label: "SEO" },
  { key: "lcpMs", label: "LCP" },
  { key: "cls", label: "CLS" },
  { key: "tbtMs", label: "TBT" },
];

const SECONDARY_SCORE_KEYS = [
  "accessibilityScore",
  "bestPracticesScore",
  "seoScore",
] as const;

function SortHeaderButton({
  sortKey,
  label,
  activeKey,
  sortDir,
  onSort,
}: {
  sortKey: CompareSortKey;
  label: string;
  activeKey: CompareSortKey;
  sortDir: CompareSortDir;
  onSort: (key: CompareSortKey) => void;
}) {
  const handleClick = useCallback(() => {
    onSort(sortKey);
  }, [onSort, sortKey]);

  const indicator =
    activeKey === sortKey ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-foreground hover:text-primary inline-flex items-center font-medium transition-colors"
    >
      {label}
      {indicator}
    </button>
  );
}

interface DiffMetricDisplayProps {
  delta: number | null;
  higherIsBetter: boolean;
  unit?: string;
  mono?: boolean;
}

interface MetricDeltaCellProps extends DiffMetricDisplayProps {
  displayValue: string;
  showDelta: boolean;
}

function MetricDeltaCell({
  displayValue,
  delta,
  higherIsBetter,
  unit,
  showDelta,
  mono,
}: MetricDeltaCellProps) {
  return (
    <TableCell className="text-center">
      <div className="flex flex-col items-center justify-center gap-1">
        <span
          className={
            mono
              ? "font-mono text-xs font-medium tabular-nums"
              : "text-sm font-semibold tabular-nums"
          }
        >
          {displayValue}
        </span>
        {showDelta ? (
          <MetricDeltaBadge
            delta={delta}
            higherIsBetter={higherIsBetter}
            unit={unit}
          />
        ) : (
          <span className="text-muted-foreground text-xs">base</span>
        )}
      </div>
    </TableCell>
  );
}

function CompareMatrixRow({
  run,
  baselineRun,
  isFocused,
  onSetBaseline,
  onFocusDiff,
  onInspect,
  onRemove,
}: {
  run: LighthouseRunListItem;
  baselineRun: LighthouseRunListItem;
  isFocused: boolean;
  onSetBaseline: (runId: string) => void;
  onFocusDiff: (runId: string) => void;
  onInspect: (runId: string) => void;
  onRemove: (runId: string) => void;
}) {
  const isBase = run.id === baselineRun.id;

  return (
    <TableRow>
      <TableCell>
        {isBase ? (
          <Badge variant="info">
            <Pin className="size-3" />
            <span>Baseline</span>
          </Badge>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onSetBaseline(run.id)}
          >
            Set Base
          </Button>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-foreground font-medium">
            {shortUrlLabel(run.url)}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatShortTimestamp(run.createdAt)}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="neutral">{run.formFactor}</Badge>
      </TableCell>
      <TableCell className="text-center">
        <div className="flex flex-col items-center justify-center gap-1">
          <Badge variant={getScoreTone(run.performanceScore)}>
            {run.performanceScore ?? "—"}
          </Badge>
          {isBase ? (
            <span className="text-muted-foreground text-xs">base</span>
          ) : (
            <MetricDeltaBadge
              delta={computeDelta(
                run.performanceScore,
                baselineRun.performanceScore,
              )}
              higherIsBetter
            />
          )}
        </div>
      </TableCell>
      {SECONDARY_SCORE_KEYS.map((key) => (
        <MetricDeltaCell
          key={key}
          displayValue={String(run[key] ?? "—")}
          delta={computeDelta(run[key], baselineRun[key])}
          higherIsBetter
          showDelta={!isBase}
        />
      ))}
      <MetricDeltaCell
        displayValue={formatCwvValue("lcpMs", run.lcpMs)}
        delta={computeDelta(run.lcpMs, baselineRun.lcpMs)}
        higherIsBetter={false}
        unit=" ms"
        showDelta={!isBase}
        mono
      />
      <MetricDeltaCell
        displayValue={formatCwvValue("cls", run.cls)}
        delta={computeDelta(run.cls, baselineRun.cls)}
        higherIsBetter={false}
        showDelta={!isBase}
        mono
      />
      <MetricDeltaCell
        displayValue={formatCwvValue("tbtMs", run.tbtMs)}
        delta={computeDelta(run.tbtMs, baselineRun.tbtMs)}
        higherIsBetter={false}
        unit=" ms"
        showDelta={!isBase}
        mono
      />
      <TableCell className="text-center">
        <div className="inline-flex items-center justify-center gap-1.5">
          <div className="flex flex-col items-stretch gap-1">
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="w-full"
              onClick={() => onInspect(run.id)}
            >
              Inspect
            </Button>
            {!isBase ? (
              <Button
                type="button"
                size="xs"
                variant={isFocused ? "default" : "outline"}
                className="w-full"
                onClick={() => onFocusDiff(run.id)}
              >
                Diff Insights
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            aria-label={`Remove run ${run.id}`}
            onClick={() => onRemove(run.id)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Sortable Comparison Matrix displaying metric deltas relative to the pinned Baseline run.
 */
function CompareMatrixCard({
  sortedRuns,
  baselineRun,
  sortKey,
  sortDir,
  focusedDiffRunId,
  onSort,
  onSwapBaseline,
  onSetBaseline,
  onFocusDiff,
  onInspect,
  onRemove,
}: {
  sortedRuns: readonly LighthouseRunListItem[];
  baselineRun: LighthouseRunListItem | null;
  sortKey: CompareSortKey;
  sortDir: CompareSortDir;
  focusedDiffRunId: string | null;
  onSort: (key: CompareSortKey) => void;
  onSwapBaseline: () => void;
  onSetBaseline: (runId: string) => void;
  onFocusDiff: (runId: string) => void;
  onInspect: (runId: string) => void;
  onRemove: (runId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>
              Comparison Matrix ({sortedRuns.length}{" "}
              {sortedRuns.length === 1 ? "Run" : "Runs"})
            </CardTitle>
            <CardDescription>
              {baselineRun
                ? `Deltas computed against pinned Baseline (${shortUrlLabel(baselineRun.url)} · ${formatShortTimestamp(baselineRun.createdAt)}).`
                : "Select at least one Audit Run to inspect metric deltas."}
            </CardDescription>
          </div>
          {sortedRuns.length === 2 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSwapBaseline}
            >
              <ArrowLeftRight className="size-3.5" />
              <span>Swap Baseline</span>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {sortedRuns.length === 0 || !baselineRun ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No runs in the comparison set</EmptyTitle>
              <EmptyDescription>
                Include runs using the Compare Builder to review score and
                metric deltas.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table containerClassName="scrollbar-thin max-h-160 overflow-y-auto">
            <TableHeader sticky>
              <TableRow>
                <TableHead>Baseline</TableHead>
                <TableHead>
                  <SortHeaderButton
                    sortKey="createdAt"
                    label="URL & Timestamp"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                </TableHead>
                <TableHead className="text-center">Profile</TableHead>
                <TableHead className="text-center">
                  <SortHeaderButton
                    sortKey="performanceScore"
                    label="Perf"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                </TableHead>
                {SORTABLE_COLUMNS.map((col) => (
                  <TableHead key={col.key} className="text-center">
                    <SortHeaderButton
                      sortKey={col.key}
                      label={col.label}
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={onSort}
                    />
                  </TableHead>
                ))}
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRuns.map((run) => (
                <CompareMatrixRow
                  key={run.id}
                  run={run}
                  baselineRun={baselineRun}
                  isFocused={focusedDiffRunId === run.id}
                  onSetBaseline={onSetBaseline}
                  onFocusDiff={onFocusDiff}
                  onInspect={onInspect}
                  onRemove={onRemove}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

type VerdictTone = "success" | "warning" | "destructive" | "neutral";

const VERDICT_BANNER_CLASSES: Record<VerdictTone, string> = {
  success: "border-success-border bg-success-subtle",
  warning: "border-warning-border bg-warning-subtle",
  destructive: "border-destructive-border bg-destructive-subtle",
  neutral: "border-border bg-muted/40",
};

function pluralizeInsights(count: number): string {
  return `${count} ${count === 1 ? "insight" : "insights"}`;
}

function buildMixedVerdict(
  perfDelta: number | null,
  resolvedCount: number,
  regressedCount: number,
): { tone: VerdictTone; headline: string; subline: string } {
  const perfText =
    perfDelta === null
      ? "Some insights improved while new regressions appeared."
      : `Performance ${perfDelta > 0 ? `+${perfDelta}` : perfDelta} pts overall, with new regressions to review.`;
  return {
    tone: "warning",
    headline: `Mixed changes: ${resolvedCount} resolved, ${regressedCount} regressed`,
    subline: perfText,
  };
}

function buildRegressionVerdict(
  perfDelta: number | null,
  regressedCount: number,
): { tone: VerdictTone; headline: string; subline: string } {
  const perfSuffix =
    perfDelta !== null && perfDelta < 0
      ? ` (Performance ${perfDelta} pts)`
      : "";
  const subline =
    regressedCount > 0
      ? `${regressedCount} newly failing ${pluralizeInsights(regressedCount)} compared to baseline.`
      : "Performance score dropped relative to baseline.";
  return {
    tone: "destructive",
    headline: `Regression detected${perfSuffix}`,
    subline,
  };
}

function buildImprovedVerdict(
  perfDelta: number | null,
  lcpDelta: number | null,
  resolvedCount: number,
): { tone: VerdictTone; headline: string; subline: string } {
  const perfSuffix =
    perfDelta !== null && perfDelta > 0
      ? ` (Performance +${perfDelta} pts)`
      : "";
  const lcpNote =
    lcpDelta !== null && lcpDelta < 0
      ? ` LCP improved by ${Math.abs(Math.round(lcpDelta))} ms.`
      : "";
  return {
    tone: "success",
    headline: `Improved${perfSuffix} with ${pluralizeInsights(resolvedCount)} fixed`,
    subline: `Zero new regressions introduced.${lcpNote}`,
  };
}

function classifyPerfDelta(
  perfDelta: number | null,
): "improved" | "regressed" | "flat" {
  if (perfDelta === null || perfDelta === 0) {
    return "flat";
  }
  return perfDelta > 0 ? "improved" : "regressed";
}

function summarizeDiffVerdict(diff: LighthouseDiffResponse): {
  tone: VerdictTone;
  headline: string;
  subline: string;
} {
  const perfDelta = diff.deltas.scores.performanceScore;
  const lcpDelta = diff.deltas.metrics.lcpMs;
  const resolvedCount = diff.deltas.insights.resolved.length;
  const regressedCount = diff.deltas.insights.regressed.length;
  const perfTrend = classifyPerfDelta(perfDelta);
  const hasImprovement = perfTrend === "improved" || resolvedCount > 0;
  const hasRegression = perfTrend === "regressed" || regressedCount > 0;

  if (hasImprovement && regressedCount > 0) {
    return buildMixedVerdict(perfDelta, resolvedCount, regressedCount);
  }
  if (hasRegression) {
    return buildRegressionVerdict(perfDelta, regressedCount);
  }
  if (hasImprovement) {
    return buildImprovedVerdict(perfDelta, lcpDelta, resolvedCount);
  }
  return {
    tone: "neutral",
    headline: "No major score or insight transitions",
    subline: "Category scores and insight statuses match the baseline run.",
  };
}

function formatPrimarySavings(
  insight: LighthouseInsightItem | undefined,
): string | null {
  if (!insight) {
    return null;
  }
  const entry = Object.entries(insight.metricSavings).find(
    ([, val]) => val > 0,
  );
  if (!entry) {
    return null;
  }
  const [metric, value] = entry;
  return metric === "CLS"
    ? `${metric} ${value.toFixed(2)}`
    : `${metric} ${Math.round(value)} ms`;
}

function DiffVerdictBanner({
  verdict,
  resolvedCount,
  regressedCount,
}: {
  verdict: { tone: VerdictTone; headline: string; subline: string };
  resolvedCount: number;
  regressedCount: number;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3",
        VERDICT_BANNER_CLASSES[verdict.tone],
      )}
    >
      <div>
        <div className="text-foreground text-sm font-semibold">
          {verdict.headline}
        </div>
        <div className="text-muted-foreground text-xs">{verdict.subline}</div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="success">{resolvedCount} fixed</Badge>
        <Badge variant={regressedCount > 0 ? "destructive" : "neutral"}>
          {regressedCount} regressed
        </Badge>
      </div>
    </div>
  );
}

interface DiffMetricStripCellProps extends DiffMetricDisplayProps {
  label: string;
  beforeText: string;
  afterText: string;
}

function DiffMetricStripCell({
  label,
  beforeText,
  afterText,
  delta,
  higherIsBetter,
  unit,
  mono,
}: DiffMetricStripCellProps) {
  return (
    <div className="border-border bg-muted/30 flex flex-col gap-1 rounded-lg border px-3 py-2.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <div
        className={cn(
          "flex flex-wrap items-baseline gap-1 tabular-nums",
          mono && "font-mono text-xs",
        )}
      >
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {beforeText}
        </span>
        <span className="text-muted-foreground text-xs">→</span>
        <span className="text-foreground text-sm font-semibold whitespace-nowrap">
          {afterText}
        </span>
      </div>
      <div>
        <MetricDeltaBadge
          delta={delta}
          higherIsBetter={higherIsBetter}
          unit={unit}
        />
      </div>
    </div>
  );
}

function formatInsightDescription(description: string): string {
  return description
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

const INSIGHT_STATUS_FALLBACKS: Record<
  "resolved" | "regressed",
  { before: string; after: string }
> = {
  resolved: { before: "Failed", after: "Passed" },
  regressed: { before: "Passed", after: "Failed" },
};

function pickDisplayValue(
  insight: LighthouseInsightItem | undefined,
  fallback: string,
): string {
  return insight?.displayValue ?? fallback;
}

function resolveInsightAuditRowData(
  itemId: string,
  baselineInsights: ReadonlyMap<string, LighthouseInsightItem>,
  comparisonInsights: ReadonlyMap<string, LighthouseInsightItem>,
  variant: "resolved" | "regressed",
) {
  const base = baselineInsights.get(itemId);
  const comp = comparisonInsights.get(itemId);
  const fallbacks = INSIGHT_STATUS_FALLBACKS[variant];
  return {
    savings: formatPrimarySavings(variant === "resolved" ? base : comp),
    beforeVal: pickDisplayValue(base, fallbacks.before),
    afterVal: pickDisplayValue(comp, fallbacks.after),
    description: comp?.description ?? base?.description,
  };
}

function InsightAuditStatusRow({
  item,
  baselineInsights,
  comparisonInsights,
  variant,
  badgeTone,
  ItemIcon,
  iconClass,
}: {
  item: InsightDiffItem;
  baselineInsights: ReadonlyMap<string, LighthouseInsightItem>;
  comparisonInsights: ReadonlyMap<string, LighthouseInsightItem>;
  variant: "resolved" | "regressed";
  badgeTone: "success" | "destructive" | "outline";
  ItemIcon: typeof CheckCircle2;
  iconClass: string;
}) {
  const { savings, beforeVal, afterVal, description } =
    resolveInsightAuditRowData(
      item.id,
      baselineInsights,
      comparisonInsights,
      variant,
    );

  return (
    <div className="border-border bg-card flex flex-col gap-1 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
          <ItemIcon className={iconClass} />
          <span className="truncate">{item.title}</span>
        </span>
        {savings ? <Badge variant={badgeTone}>{savings}</Badge> : null}
      </div>
      <div className="font-mono text-xs tabular-nums">
        <span className="text-muted-foreground">{beforeVal}</span>{" "}
        <span className="text-muted-foreground">→</span>{" "}
        <strong className="text-foreground font-semibold">{afterVal}</strong>
      </div>
      {description ? (
        <p className="text-muted-foreground line-clamp-2 text-xs">
          {formatInsightDescription(description)}
        </p>
      ) : null}
    </div>
  );
}

function InsightAuditStatusCard({
  title,
  countText,
  badgeTone,
  emptyText,
  items,
  baselineInsights,
  comparisonInsights,
  variant,
}: {
  title: string;
  countText: string;
  badgeTone: "success" | "destructive" | "outline";
  emptyText: string;
  items: readonly InsightDiffItem[];
  baselineInsights: ReadonlyMap<string, LighthouseInsightItem>;
  comparisonInsights: ReadonlyMap<string, LighthouseInsightItem>;
  variant: "resolved" | "regressed";
}) {
  const ItemIcon = variant === "resolved" ? CheckCircle2 : AlertTriangle;
  const iconClass =
    variant === "resolved"
      ? "text-success size-3.5 shrink-0"
      : "text-destructive size-3.5 shrink-0";

  return (
    <div className="border-border bg-muted/30 flex flex-col gap-2.5 rounded-lg border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-foreground text-xs font-semibold">
          {title}
        </strong>
        <Badge variant={badgeTone}>{countText}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-xs">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <InsightAuditStatusRow
              key={item.id}
              item={item}
              baselineInsights={baselineInsights}
              comparisonInsights={comparisonInsights}
              variant={variant}
              badgeTone={badgeTone}
              ItemIcon={ItemIcon}
              iconClass={iconClass}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function buildMsCwvMetric(
  label: string,
  key: "lcpMs" | "tbtMs",
  diff: LighthouseDiffResponse,
) {
  const rawDelta = diff.deltas.metrics[key];
  return {
    label,
    a: formatCwvValue(key, diff.baseline[key]),
    b: formatCwvValue(key, diff.comparison[key]),
    delta: rawDelta === null ? null : Math.round(rawDelta),
    unit: " ms",
  };
}

function DiffResponseBody({ diff }: { diff: LighthouseDiffResponse }) {
  const verdict = summarizeDiffVerdict(diff);
  const scoreMetrics = [
    {
      label: "Perf",
      a: diff.baseline.performanceScore,
      b: diff.comparison.performanceScore,
      delta: diff.deltas.scores.performanceScore,
    },
    {
      label: "A11y",
      a: diff.baseline.accessibilityScore,
      b: diff.comparison.accessibilityScore,
      delta: diff.deltas.scores.accessibilityScore,
    },
    {
      label: "BP",
      a: diff.baseline.bestPracticesScore,
      b: diff.comparison.bestPracticesScore,
      delta: diff.deltas.scores.bestPracticesScore,
    },
    {
      label: "SEO",
      a: diff.baseline.seoScore,
      b: diff.comparison.seoScore,
      delta: diff.deltas.scores.seoScore,
    },
  ];
  const cwvMetrics = [
    buildMsCwvMetric("LCP", "lcpMs", diff),
    {
      label: "CLS",
      a: formatCwvValue("cls", diff.baseline.cls),
      b: formatCwvValue("cls", diff.comparison.cls),
      delta:
        diff.deltas.metrics.cls === null
          ? null
          : Number(diff.deltas.metrics.cls.toFixed(3)),
      unit: "",
    },
    buildMsCwvMetric("TBT", "tbtMs", diff),
  ];

  const baselineInsights = new Map(
    diff.baseline.summary.insights.map((item) => [item.id, item]),
  );
  const comparisonInsights = new Map(
    diff.comparison.summary.insights.map((item) => [item.id, item]),
  );
  const { resolved, regressed } = diff.deltas.insights;

  return (
    <>
      <DiffVerdictBanner
        verdict={verdict}
        resolvedCount={resolved.length}
        regressedCount={regressed.length}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {scoreMetrics.map((entry) => (
          <DiffMetricStripCell
            key={entry.label}
            label={entry.label}
            beforeText={String(entry.a ?? "—")}
            afterText={String(entry.b ?? "—")}
            delta={entry.delta}
            higherIsBetter
            unit=" pts"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {cwvMetrics.map((entry) => (
          <DiffMetricStripCell
            key={entry.label}
            label={entry.label}
            beforeText={entry.a}
            afterText={entry.b}
            delta={entry.delta}
            higherIsBetter={false}
            unit={entry.unit}
            mono
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <InsightAuditStatusCard
          title="Resolved Insight Audits"
          countText={`${resolved.length} fixed`}
          badgeTone="success"
          emptyText="No newly resolved insights between these two runs."
          items={resolved}
          baselineInsights={baselineInsights}
          comparisonInsights={comparisonInsights}
          variant="resolved"
        />
        <InsightAuditStatusCard
          title="Regressed Insight Audits"
          countText={`${regressed.length} regressed`}
          badgeTone={regressed.length > 0 ? "destructive" : "outline"}
          emptyText="No new regressions introduced."
          items={regressed}
          baselineInsights={baselineInsights}
          comparisonInsights={comparisonInsights}
          variant="regressed"
        />
      </div>
    </>
  );
}

function DiffQueryContent({
  isPending,
  errorMessage,
  diffData,
  onRetry,
}: {
  isPending: boolean;
  errorMessage: string | null;
  diffData: LighthouseDiffResponse | undefined;
  onRetry: () => void;
}) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (errorMessage) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangle />
          </EmptyMedia>
          <EmptyTitle>Unable to load Insight Audit Diff</EmptyTitle>
          <EmptyDescription>{errorMessage}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  return diffData ? <DiffResponseBody diff={diffData} /> : null;
}

/**
 * Expandable pairwise Insight Audit diff backed by `GET /api/lighthouse/diff`.
 */
function CompareDiffPanel({
  baselineRun,
  targetRun,
  allowCollapse,
  onFocusLatest,
  onCollapse,
  fallbackTargetId,
}: {
  baselineRun: LighthouseRunListItem;
  targetRun: LighthouseRunListItem | null;
  allowCollapse: boolean;
  fallbackTargetId: string | null;
  onFocusLatest: (runId: string) => void;
  onCollapse: () => void;
}) {
  const { diffData, isPending, errorMessage, handleRetryDiff } = useCompareDiff(
    baselineRun.id,
    targetRun?.id,
  );

  if (!targetRun) {
    return (
      <div className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3">
        <span className="text-muted-foreground text-xs">
          Click <strong>Diff Insights</strong> on any row above to compare
          resolved and regressed Insight Audits against Baseline.
        </span>
        {fallbackTargetId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onFocusLatest(fallbackTargetId)}
          >
            Diff Latest vs Baseline
          </Button>
        ) : null}
      </div>
    );
  }

  const mismatch =
    baselineRun.url !== targetRun.url ||
    baselineRun.formFactor !== targetRun.formFactor;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Insight Audit Diff — Baseline vs Selected Run</CardTitle>
            <CardDescription>
              Baseline: {shortUrlLabel(baselineRun.url)} (
              {formatShortTimestamp(baselineRun.createdAt)}) → Compared:{" "}
              {shortUrlLabel(targetRun.url)} (
              {formatShortTimestamp(targetRun.createdAt)})
            </CardDescription>
          </div>
          {allowCollapse ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCollapse}
            >
              <X className="size-3.5" />
              <span>Collapse</span>
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-4">
          {mismatch ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>Profile difference</AlertTitle>
              <AlertDescription>
                Comparing different URLs or device profiles (
                {baselineRun.formFactor} vs {targetRun.formFactor}).
              </AlertDescription>
            </Alert>
          ) : null}

          <DiffQueryContent
            isPending={isPending}
            errorMessage={errorMessage}
            diffData={diffData}
            onRetry={handleRetryDiff}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Interactive multi-run comparison workspace (`/lighthouse/compare`).
 */
export function ComparePage() {
  const cmp = useCompareController();
  const [inspectorRunId, setInspectorRunId] = useState<string | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(false);

  const handleOpenNewAudit = useCallback(() => {
    setTriggerOpen(true);
  }, []);

  const handleInspectorOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setInspectorRunId(null);
    }
  }, []);

  let body: ReactNode;
  if (cmp.isListPending) {
    body = (
      <>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </>
    );
  } else if (cmp.listErrorMessage) {
    body = (
      <LighthouseEmptyNotice
        icon={<AlertCircle />}
        title="Unable to load Audit Runs"
        description={cmp.listErrorMessage}
        action={
          <Button type="button" variant="outline" onClick={cmp.handleRetryList}>
            Retry
          </Button>
        }
      />
    );
  } else if (!cmp.hasAnyRuns) {
    body = (
      <LighthouseEmptyNotice
        icon={<GitCompare />}
        title="No Audit Runs available to compare"
        description="Trigger at least two Lighthouse audits to inspect score trends, metric deltas, and Insight Audit transitions."
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
  } else {
    body = (
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <CompareBuilderSidebar builder={cmp.builder} />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <CompareTrendChart
            runs={cmp.chronoRuns}
            baselineRun={cmp.baselineRun}
            onInspectRun={setInspectorRunId}
          />

          <CompareMatrixCard
            sortedRuns={cmp.sortedRuns}
            baselineRun={cmp.baselineRun}
            sortKey={cmp.sortKey}
            sortDir={cmp.sortDir}
            focusedDiffRunId={cmp.diffTargetRun?.id ?? null}
            onSort={cmp.handleSort}
            onSwapBaseline={cmp.handleSwapTwoBaseline}
            onSetBaseline={cmp.handleSetBaseline}
            onFocusDiff={cmp.setFocusedDiffRunId}
            onInspect={setInspectorRunId}
            onRemove={cmp.handleRemoveRun}
          />

          {cmp.baselineRun && cmp.sortedRuns.length >= 2 ? (
            <CompareDiffPanel
              baselineRun={cmp.baselineRun}
              targetRun={cmp.diffTargetRun}
              allowCollapse={cmp.sortedRuns.length > 2}
              fallbackTargetId={cmp.fallbackDiffTargetId}
              onFocusLatest={cmp.setFocusedDiffRunId}
              onCollapse={cmp.handleCollapseDiff}
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <LighthouseHeader activeView="compare" onNewAudit={handleOpenNewAudit} />

      {body}

      <RunInspectorSheet
        runId={inspectorRunId}
        onOpenChange={handleInspectorOpenChange}
      />

      <TriggerAuditSheet open={triggerOpen} onOpenChange={setTriggerOpen} />
    </div>
  );
}
