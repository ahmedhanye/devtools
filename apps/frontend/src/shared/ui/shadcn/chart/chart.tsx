"use client";

import * as React from "react";
import type * as RechartsPrimitive from "recharts";
import type { TooltipValueType } from "recharts";
import { cn } from "@/shared/lib";

const THEMES = { light: "", dark: ".dark" } as const;
const INITIAL_DIMENSION = { width: 320, height: 200 } as const;

const LazyResponsiveContainer = React.lazy(() =>
  import("recharts").then((mod) => ({
    default: mod.ResponsiveContainer,
  })),
);

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>;

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.use(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }
  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
  initialDimension?: {
    width: number;
    height: number;
  };
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;
  const contextValue = React.useMemo(() => ({ config }), [config]);

  return (
    <ChartContext value={contextValue}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <React.Suspense fallback={null}>
          <LazyResponsiveContainer initialDimension={initialDimension}>
            {children}
          </LazyResponsiveContainer>
        </React.Suspense>
      </div>
    </ChartContext>
  );
}

function resolvePayloadKey(rawKey: unknown): string {
  if (typeof rawKey === "string" || typeof rawKey === "number") {
    return String(rawKey);
  }
  return "value";
}

function readStringField(source: unknown, key: string): string | undefined {
  if (typeof source !== "object" || source === null || !(key in source)) {
    return undefined;
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: object,
  key: string,
) {
  const nested =
    "payload" in payload
      ? (payload as { payload?: unknown }).payload
      : undefined;
  const labelKey =
    readStringField(payload, key) ?? readStringField(nested, key) ?? key;
  return config[labelKey] ?? config[key];
}

type TooltipPayloadItem = NonNullable<
  RechartsPrimitive.DefaultTooltipContentProps<
    TooltipValueType,
    number | string
  >["payload"]
>[number];

type TooltipLabelFormatter = RechartsPrimitive.DefaultTooltipContentProps<
  TooltipValueType,
  number | string
>["labelFormatter"];

type TooltipFormatter = RechartsPrimitive.DefaultTooltipContentProps<
  TooltipValueType,
  number | string
>["formatter"];

function resolveItemLookupKey(
  explicitKey: string | undefined,
  item: TooltipPayloadItem,
): string {
  if (explicitKey) {
    return explicitKey;
  }
  return resolvePayloadKey(item.name ?? item.dataKey);
}

function resolveTooltipTitle(
  config: ChartConfig,
  item: TooltipPayloadItem,
  label: unknown,
  labelKey?: string,
) {
  if (!labelKey && typeof label === "string") {
    const labelConfig = config[label];
    return labelConfig ? labelConfig.label : label;
  }
  const key = resolveItemLookupKey(
    labelKey ?? readStringField(item, "dataKey"),
    item,
  );
  return getPayloadConfigFromPayload(config, item, key)?.label;
}

function renderTooltipHeader(args: {
  hideLabel: boolean;
  payload: readonly TooltipPayloadItem[];
  label: unknown;
  labelKey?: string;
  labelFormatter?: TooltipLabelFormatter;
  labelClassName?: string;
  config: ChartConfig;
}) {
  const firstItem = args.payload[0];
  if (args.hideLabel || !firstItem) {
    return null;
  }
  const rawTitle = resolveTooltipTitle(
    args.config,
    firstItem,
    args.label,
    args.labelKey,
  );
  const content = args.labelFormatter
    ? args.labelFormatter(rawTitle, args.payload)
    : rawTitle;
  return content ? (
    <div className={cn("font-medium", args.labelClassName)}>{content}</div>
  ) : null;
}

function TooltipItemIndicator({
  itemConfig,
  hideIndicator,
  indicator,
  indicatorColor,
  nestLabel,
}: {
  itemConfig: ChartConfig[string] | undefined;
  hideIndicator: boolean;
  indicator: "line" | "dot" | "dashed";
  indicatorColor: string | undefined;
  nestLabel: boolean;
}) {
  if (itemConfig?.icon) {
    return <itemConfig.icon />;
  }
  if (hideIndicator) {
    return null;
  }
  return (
    <div
      className={cn(
        "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
        {
          "size-2.5": indicator === "dot",
          "w-1": indicator === "line",
          "w-0 border-[1.5px] border-dashed bg-transparent":
            indicator === "dashed",
          "my-0.5": nestLabel && indicator === "dashed",
        },
      )}
      style={
        {
          "--color-bg": indicatorColor,
          "--color-border": indicatorColor,
        } as React.CSSProperties
      }
    />
  );
}

function TooltipItemValue({ value }: { value: TooltipPayloadItem["value"] }) {
  if (value == null) {
    return null;
  }
  const text =
    typeof value === "number" ? value.toLocaleString() : String(value);
  return (
    <span className="text-foreground font-mono font-medium tabular-nums">
      {text}
    </span>
  );
}

const TOOLTIP_ROW_BASE_CLASS =
  "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5";
const TOOLTIP_ROW_DOT_CLASS = cn(TOOLTIP_ROW_BASE_CLASS, "items-center");

function resolveIndicatorColor(
  color: string | undefined,
  item: TooltipPayloadItem,
  itemConfig: ChartConfig[string] | undefined,
): string | undefined {
  if (color) {
    return color;
  }
  const payloadFill = readStringField(item.payload, "fill");
  if (payloadFill) {
    return payloadFill;
  }
  if (item.color) {
    return item.color;
  }
  return itemConfig?.color;
}

function TooltipItemRowBody({
  item,
  itemConfig,
  indicator,
  indicatorColor,
  hideIndicator,
  nestLabel,
  tooltipLabel,
}: {
  item: TooltipPayloadItem;
  itemConfig: ChartConfig[string] | undefined;
  indicator: "line" | "dot" | "dashed";
  indicatorColor: string | undefined;
  hideIndicator: boolean;
  nestLabel: boolean;
  tooltipLabel: React.ReactNode;
}) {
  const displayLabel = itemConfig ? itemConfig.label : item.name;
  return (
    <>
      <TooltipItemIndicator
        itemConfig={itemConfig}
        hideIndicator={hideIndicator}
        indicator={indicator}
        indicatorColor={indicatorColor}
        nestLabel={nestLabel}
      />
      <div
        className={cn(
          "flex flex-1 justify-between leading-none",
          nestLabel ? "items-end" : "items-center",
        )}
      >
        <div className="grid gap-1.5">
          {nestLabel ? tooltipLabel : null}
          <span className="text-muted-foreground">{displayLabel}</span>
        </div>
        <TooltipItemValue value={item.value} />
      </div>
    </>
  );
}

function TooltipItemRow({
  item,
  index,
  config,
  nameKey,
  color,
  indicator,
  hideIndicator,
  nestLabel,
  tooltipLabel,
  formatter,
}: {
  item: TooltipPayloadItem;
  index: number;
  config: ChartConfig;
  nameKey?: string;
  color?: string;
  indicator: "line" | "dot" | "dashed";
  hideIndicator: boolean;
  nestLabel: boolean;
  tooltipLabel: React.ReactNode;
  formatter?: TooltipFormatter;
}) {
  const key = resolveItemLookupKey(nameKey, item);
  const itemConfig = getPayloadConfigFromPayload(config, item, key);
  const indicatorColor = resolveIndicatorColor(color, item, itemConfig);
  const rowClass =
    indicator === "dot" ? TOOLTIP_ROW_DOT_CLASS : TOOLTIP_ROW_BASE_CLASS;

  if (formatter && item.value !== undefined && item.name) {
    return (
      <div className={rowClass}>
        {formatter(item.value, item.name, item, index, item.payload)}
      </div>
    );
  }

  return (
    <div className={rowClass}>
      <TooltipItemRowBody
        item={item}
        itemConfig={itemConfig}
        indicator={indicator}
        indicatorColor={indicatorColor}
        hideIndicator={hideIndicator}
        nestLabel={nestLabel}
        tooltipLabel={tooltipLabel}
      />
    </div>
  );
}

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    nameKey?: string;
    labelKey?: string;
  } & Omit<
    RechartsPrimitive.DefaultTooltipContentProps<
      TooltipValueType,
      number | string
    >,
    "accessibilityLayer"
  >) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  const nestLabel = payload.length === 1 && indicator !== "dot";
  const tooltipLabel = renderTooltipHeader({
    hideLabel,
    payload,
    label,
    labelKey,
    labelFormatter,
    labelClassName,
    config,
  });

  const visibleItems = payload.filter((item) => item.type !== "none");

  return (
    <div
      className={cn(
        "border-border/50 bg-background grid min-w-32 items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
        className,
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {visibleItems.map((item, index) => (
          <TooltipItemRow
            key={resolvePayloadKey(item.dataKey ?? item.name)}
            item={item}
            index={index}
            config={config}
            nameKey={nameKey}
            color={color}
            indicator={indicator}
            hideIndicator={hideIndicator}
            nestLabel={nestLabel}
            tooltipLabel={tooltipLabel}
            formatter={formatter}
          />
        ))}
      </div>
    </div>
  );
}

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> & {
  hideIcon?: boolean;
  nameKey?: string;
} & RechartsPrimitive.DefaultLegendContentProps) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  const visibleItems = payload.filter((item) => item.type !== "none");

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {visibleItems.map((item) => {
        const key = resolvePayloadKey(nameKey ?? item.dataKey);
        const itemConfig = getPayloadConfigFromPayload(config, item, key);
        const indicatorColor = item.color ?? itemConfig?.color;

        return (
          <div
            key={key}
            className="[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3"
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div
                className="size-2 shrink-0 rounded-[2px] bg-(--color-indicator)"
                style={
                  {
                    "--color-indicator": indicatorColor,
                  } as React.CSSProperties
                }
              />
            )}
            {itemConfig?.label}
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartTooltipContent, ChartLegendContent };
