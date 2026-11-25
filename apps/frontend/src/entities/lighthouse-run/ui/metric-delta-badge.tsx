import { Badge } from "@/shared/ui";

/**
 * Displays a signed numeric delta pill colored semantically by improvement vs regression.
 */
export function MetricDeltaBadge({
  delta,
  higherIsBetter,
  unit = "",
  className,
}: {
  delta: number | null;
  higherIsBetter: boolean;
  unit?: string;
  className?: string;
}) {
  if (delta === null) {
    return null;
  }
  if (delta === 0) {
    return (
      <Badge variant="neutral" className={className}>
        0{unit}
      </Badge>
    );
  }
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const tone = improved ? "success" : "destructive";
  const prefix = delta > 0 ? "+" : "";

  return (
    <Badge variant={tone} className={className}>
      {prefix}
      {delta}
      {unit}
    </Badge>
  );
}
