import type { Meta, StoryObj } from "@storybook/react";
import { Circle, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "./trace";

const meta: Meta<typeof Trace> = {
  title: "Shared/Shadcn/Trace",
  component: Trace,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Trace>;

export const Default: Story = {
  render: () => (
    <Trace className="max-w-md">
      <TraceLine>
        <TraceIcon>
          <CircleCheck className="text-success" />
        </TraceIcon>
        <TraceTitle>Locate Browser</TraceTitle>
        <TraceDescription>0.4s</TraceDescription>
      </TraceLine>
      <TraceLine status="running">
        <TraceIcon>
          <LoaderCircle className="animate-spin text-primary" />
        </TraceIcon>
        <TraceTitle>Navigate Target URL</TraceTitle>
      </TraceLine>
      <TraceLine status="pending">
        <TraceIcon>
          <Circle className="text-muted-foreground/60" />
        </TraceIcon>
        <TraceTitle>Generate Report Artifact</TraceTitle>
      </TraceLine>
      <TraceLine status="error">
        <TraceIcon>
          <CircleAlert />
        </TraceIcon>
        <TraceTitle>Failed to capture trace</TraceTitle>
      </TraceLine>
    </Trace>
  ),
};

export const NestedCollapsible: Story = {
  render: () => (
    <Trace className="max-w-md">
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceIcon>
              <CircleCheck className="text-success" />
            </TraceIcon>
            <TraceTitle>Iteration 1 of 3</TraceTitle>
            <TraceDescription>completed 3 steps</TraceDescription>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace>
            <TraceLine>
              <TraceIcon>
                <CircleCheck className="text-success" />
              </TraceIcon>
              <TraceTitle>Launch Headless Chrome</TraceTitle>
            </TraceLine>
            <TraceLine>
              <TraceIcon>
                <CircleCheck className="text-success" />
              </TraceIcon>
              <TraceTitle>Collect Traces &amp; Scores</TraceTitle>
            </TraceLine>
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /Iteration 1 of 3/i });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText("Launch Headless Chrome")).toBeVisible();
  },
};
