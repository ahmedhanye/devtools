import type { Meta, StoryObj } from "@storybook/react";
import { Progress, ProgressLabel, ProgressValue } from "./progress";

const meta: Meta<typeof Progress> = {
  title: "Shared/Shadcn/Progress",
  component: Progress,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  render: () => (
    <Progress value={67} className="max-w-sm">
      <ProgressLabel>Analyzing audit batch</ProgressLabel>
      <ProgressValue />
    </Progress>
  ),
};

export const Complete: Story = {
  render: () => (
    <Progress value={100} className="max-w-sm">
      <ProgressLabel>Audit complete</ProgressLabel>
      <ProgressValue />
    </Progress>
  ),
};
