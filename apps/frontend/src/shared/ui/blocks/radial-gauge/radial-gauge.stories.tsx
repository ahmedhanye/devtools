import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { RadialGauge } from "./radial-gauge";

const meta: Meta<typeof RadialGauge> = {
  title: "Shared/Blocks/RadialGauge",
  component: RadialGauge,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof RadialGauge>;

export const ScoreVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-6">
      <RadialGauge value={96} tone="success" size="sm" label="Small" />
      <RadialGauge value={74} tone="warning" size="md" label="Medium" />
      <RadialGauge value={42} tone="destructive" size="lg" label="Large" />
      <RadialGauge value={null} tone="neutral" size="md" label="Unavailable" />
      <RadialGauge value={80} maxValue={0} showValue={false} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("img", { name: "Small: 96" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("img", { name: "Unavailable: N/A" }),
    ).toBeInTheDocument();
  },
};
