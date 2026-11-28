import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { MetricDeltaBadge } from "./metric-delta-badge";

const meta: Meta<typeof MetricDeltaBadge> = {
  title: "Entities/LighthouseRun/MetricDeltaBadge",
  component: MetricDeltaBadge,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof MetricDeltaBadge>;

export const DeltaStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <MetricDeltaBadge delta={12} higherIsBetter unit=" pts" />
      <MetricDeltaBadge delta={-8} higherIsBetter unit=" pts" />
      <MetricDeltaBadge delta={-350} higherIsBetter={false} unit=" ms" />
      <MetricDeltaBadge delta={420} higherIsBetter={false} unit=" ms" />
      <MetricDeltaBadge delta={0} higherIsBetter unit=" pts" />
      <MetricDeltaBadge delta={null} higherIsBetter />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("+12 pts")).toBeInTheDocument();
    await expect(canvas.getByText("-8 pts")).toBeInTheDocument();
    await expect(canvas.getByText("-350 ms")).toBeInTheDocument();
    await expect(canvas.getByText("+420 ms")).toBeInTheDocument();
    await expect(canvas.getByText("0 pts")).toBeInTheDocument();
  },
};
