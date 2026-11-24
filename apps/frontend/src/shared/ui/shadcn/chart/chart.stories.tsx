import { Component, lazy, type ReactNode, Suspense } from "react";
import type * as RechartsModule from "recharts";
import type { Meta, StoryObj } from "@storybook/react";
import { Activity } from "lucide-react";
import { expect, within } from "storybook/test";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegendContent,
  ChartTooltipContent,
} from "./chart";

const SAMPLE_DATA = [
  { label: "Nov 18", score: 76 },
  { label: "Nov 19", score: 84 },
  { label: "Nov 20", score: 91 },
  { label: "Nov 21", score: 94 },
];

const CHART_CONFIG: ChartConfig = {
  score: {
    label: "Performance",
    color: "var(--color-chart-1)",
    icon: Activity,
  },
  accessibility: {
    label: "Accessibility",
    color: "var(--color-chart-2)",
  },
};

const MULTI_TOOLTIP_PAYLOAD = [
  {
    graphicalItemId: "score-item",
    name: "score",
    dataKey: "score",
    value: 94,
    color: "var(--color-chart-1)",
    payload: { score: "score" },
  },
  {
    graphicalItemId: "a11y-item",
    name: "accessibility",
    dataKey: "accessibility",
    value: "98%",
    payload: { fill: "#2563eb" },
  },
  {
    graphicalItemId: "empty-val-item",
    value: undefined,
    payload: {},
  },
  {
    graphicalItemId: "ignored-item",
    name: "ignored",
    dataKey: "ignored",
    type: "none" as const,
    value: 0,
  },
];

const SINGLE_DASHED_PAYLOAD = [
  {
    graphicalItemId: "a11y-single-item",
    name: "accessibility",
    dataKey: "accessibility",
    value: 96,
    payload: {},
  },
];

const LEGEND_ITEMS_PAYLOAD = [
  {
    value: "score",
    dataKey: "score",
    color: "var(--color-chart-1)",
  },
  {
    value: "accessibility",
    dataKey: "accessibility",
    color: "#2563eb",
  },
  {
    value: "hidden",
    dataKey: "hidden",
    type: "none" as const,
  },
];

const EMPTY_LEGEND_PAYLOAD: [] = [];
const INITIAL_DIMENSION = { width: 480, height: 480 };

function formatTooltipTitle(val: unknown) {
  const text =
    typeof val === "string" || typeof val === "number" ? String(val) : "";
  return <span>{`Run: ${text}`}</span>;
}

function formatCustomRow(value: unknown, name: unknown) {
  const nameText =
    typeof name === "string" || typeof name === "number" ? String(name) : "";
  const valText =
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  return <span>{`${nameText}=${valText}`}</span>;
}

class ChartErrorBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  override state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  override render() {
    if (this.state.message) {
      return <span>{this.state.message}</span>;
    }
    return this.props.children;
  }
}

function SampleAreaChartInner({
  recharts,
}: {
  recharts: typeof RechartsModule;
}) {
  const { Area, AreaChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } =
    recharts;

  return (
    <ChartContainer config={CHART_CONFIG} className="min-h-56 w-full max-w-lg">
      <AreaChart data={SAMPLE_DATA}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltipContent />} />
        <Legend content={<ChartLegendContent />} />
        <Area
          type="monotone"
          dataKey="score"
          stroke="var(--color-chart-1)"
          fill="var(--color-chart-1)"
          fillOpacity={0.2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

const LazySampleAreaChart = lazy(() =>
  import("recharts").then((recharts) => ({
    default: () => <SampleAreaChartInner recharts={recharts} />,
  })),
);

const meta: Meta<typeof ChartContainer> = {
  title: "Shared/Shadcn/Chart",
  component: ChartContainer,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ChartContainer>;

export const Default: Story = {
  render: () => (
    <Suspense fallback={null}>
      <LazySampleAreaChart />
    </Suspense>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Performance", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  },
};

export const TooltipLegendStatesAndErrorGuard: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <ChartContainer
        config={CHART_CONFIG}
        initialDimension={INITIAL_DIMENSION}
        className="aspect-auto h-120 w-full max-w-lg"
      >
        <div className="flex w-full flex-col items-start gap-3 p-2">
          <ChartTooltipContent
            active
            label="score"
            payload={MULTI_TOOLTIP_PAYLOAD}
          />
          <ChartTooltipContent
            active
            indicator="dashed"
            labelKey="accessibility"
            nameKey="accessibility"
            labelFormatter={formatTooltipTitle}
            payload={SINGLE_DASHED_PAYLOAD}
          />
          <ChartTooltipContent
            active
            indicator="line"
            hideLabel
            hideIndicator
            formatter={formatCustomRow}
            payload={SINGLE_DASHED_PAYLOAD}
          />
          <ChartTooltipContent
            active
            color="#16a34a"
            hideIndicator
            payload={SINGLE_DASHED_PAYLOAD}
          />
          <ChartTooltipContent active={false} payload={SINGLE_DASHED_PAYLOAD} />
          <ChartLegendContent
            verticalAlign="top"
            payload={LEGEND_ITEMS_PAYLOAD}
          />
          <ChartLegendContent hideIcon payload={LEGEND_ITEMS_PAYLOAD} />
          <ChartLegendContent payload={EMPTY_LEGEND_PAYLOAD} />
        </div>
      </ChartContainer>

      <ChartErrorBoundary>
        <ChartTooltipContent active={false} />
      </ChartErrorBoundary>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(
        "useChart must be used within a <ChartContainer />",
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    await expect(
      await canvas.findByText("94", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("accessibility=96")).toBeInTheDocument();
    await expect(canvas.getByText("Run: Accessibility")).toBeInTheDocument();
  },
};
