import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Button } from "../button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

const meta: Meta<typeof Tooltip> = {
  title: "Shared/Shadcn/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="p-8">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline">Hover me</Button>} />
      <TooltipContent>
        <p>Helpful tooltip information</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Bottom: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="outline">Bottom Tooltip</Button>}
      />
      <TooltipContent side="bottom">
        <p>Positioned below the trigger</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const InteractiveHover: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="outline">Interactive Hover Target</Button>}
      />
      <TooltipContent>
        <p>Interactive Tooltip Content</p>
      </TooltipContent>
    </Tooltip>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", {
      name: "Interactive Hover Target",
    });

    await expect(trigger).toBeInTheDocument();
    await userEvent.hover(trigger);

    const body = within(canvasElement.ownerDocument.body);
    const tooltipText = await body.findByText("Interactive Tooltip Content");
    await expect(tooltipText).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
  },
};

export const InteractiveKeyboardFocus: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="outline">Keyboard Focus Target</Button>}
      />
      <TooltipContent>
        <p>Keyboard Tooltip Content</p>
      </TooltipContent>
    </Tooltip>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", {
      name: "Keyboard Focus Target",
    });

    await expect(trigger).toBeInTheDocument();
    trigger.focus();
    await expect(trigger).toHaveFocus();

    const body = within(canvasElement.ownerDocument.body);
    const tooltipText = await body.findByText("Keyboard Tooltip Content");
    await expect(tooltipText).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
  },
};
