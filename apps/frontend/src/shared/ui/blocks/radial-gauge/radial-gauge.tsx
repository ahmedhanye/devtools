import { cn } from "@/shared/lib";

export type RadialGaugeTone = "neutral" | "success" | "warning" | "destructive";
export type RadialGaugeSize = "sm" | "md" | "lg";

const GAUGE_RADIUS = 42;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

const TONE_STROKE_CLASSES: Record<RadialGaugeTone, string> = {
  neutral: "stroke-muted-foreground",
  success: "stroke-success",
  warning: "stroke-warning",
  destructive: "stroke-destructive",
};

const TONE_FILL_CLASSES: Record<RadialGaugeTone, string> = {
  neutral: "fill-muted/40",
  success: "fill-success-subtle",
  warning: "fill-warning-subtle",
  destructive: "fill-destructive-subtle",
};

const TONE_TEXT_CLASSES: Record<RadialGaugeTone, string> = {
  neutral: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const CONTAINER_SIZE_CLASSES: Record<RadialGaugeSize, string> = {
  sm: "size-10",
  md: "size-16",
  lg: "size-24",
};

const VALUE_TEXT_CLASSES: Record<RadialGaugeSize, string> = {
  sm: "text-xs font-semibold",
  md: "text-base font-bold",
  lg: "text-2xl font-bold",
};

const STROKE_WIDTH_BY_SIZE: Record<RadialGaugeSize, number> = {
  sm: 8,
  md: 7,
  lg: 6,
};

/**
 * Pure SVG circular score gauge styled exclusively with semantic CSS tokens.
 */
export function RadialGauge({
  value,
  maxValue = 100,
  tone = "neutral",
  size = "md",
  label,
  showValue = true,
  className,
}: {
  value: number | null;
  maxValue?: number;
  tone?: RadialGaugeTone;
  size?: RadialGaugeSize;
  label?: string;
  showValue?: boolean;
  className?: string;
}) {
  const safeMax = maxValue > 0 ? maxValue : 100;
  const clampedRatio =
    value === null ? 0 : Math.min(1, Math.max(0, value / safeMax));
  const dashOffset = GAUGE_CIRCUMFERENCE * (1 - clampedRatio);
  const formattedValue = value === null ? "N/A" : String(Math.round(value));
  const strokeWidth = STROKE_WIDTH_BY_SIZE[size];
  const ariaLabel = label ? `${label}: ${formattedValue}` : formattedValue;

  return (
    <div
      data-slot="radial-gauge"
      className={cn("inline-flex flex-col items-center gap-1.5", className)}
    >
      <div
        className={cn(
          "relative inline-flex items-center justify-center",
          CONTAINER_SIZE_CLASSES[size],
        )}
      >
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label={ariaLabel}
          className="size-full"
        >
          <circle
            cx={50}
            cy={50}
            r={GAUGE_RADIUS}
            strokeWidth={strokeWidth}
            className={cn(
              "stroke-muted",
              value === null ? "fill-muted/40" : TONE_FILL_CLASSES[tone],
            )}
          />
          {value !== null ? (
            <circle
              cx={50}
              cy={50}
              r={GAUGE_RADIUS}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={GAUGE_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
              className={TONE_STROKE_CLASSES[tone]}
            />
          ) : null}
        </svg>
        {showValue ? (
          <span
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center tabular-nums",
              VALUE_TEXT_CLASSES[size],
              value === null
                ? "text-muted-foreground"
                : TONE_TEXT_CLASSES[tone],
            )}
          >
            {formattedValue}
          </span>
        ) : null}
      </div>
      {label ? (
        <span className="text-muted-foreground text-center text-xs font-medium">
          {label}
        </span>
      ) : null}
    </div>
  );
}
