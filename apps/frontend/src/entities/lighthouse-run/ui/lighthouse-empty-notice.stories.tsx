import type { Meta, StoryObj } from "@storybook/react";
import { AlertCircle } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "@/shared/ui";
import { LighthouseEmptyNotice } from "./lighthouse-empty-notice";

const meta: Meta<typeof LighthouseEmptyNotice> = {
  title: "Entities/LighthouseRun/LighthouseEmptyNotice",
  component: LighthouseEmptyNotice,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof LighthouseEmptyNotice>;

export const DefaultWithoutAction: Story = {
  args: {
    icon: <AlertCircle />,
    title: "No Audit Runs",
    description: "Run an audit to inspect performance metrics.",
  },
};

export const WithRetryAction: Story = {
  args: {
    icon: <AlertCircle />,
    title: "Unable to load Audit Run",
    description: "Network error",
    action: (
      <Button type="button" variant="outline" onClick={fn()}>
        Retry
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(
      canvas.getByText("Unable to load Audit Run"),
    ).toBeInTheDocument();
  },
};
