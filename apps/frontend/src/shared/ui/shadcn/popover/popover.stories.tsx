import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Button } from "../button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

const meta: Meta<typeof Popover> = {
  title: "Shared/Shadcn/Popover",
  component: Popover,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Popover>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline">Open Popover</Button>}
      />
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Filter URLs</PopoverTitle>
          <PopoverDescription>
            Pick one or more audited URLs to compare.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open Popover" });
    await userEvent.click(trigger);

    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("Filter URLs")).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await waitFor(async () => {
      await expect(body.queryByText("Filter URLs")).not.toBeInTheDocument();
    });
  },
};

export const FlushPadding: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger render={<Button variant="outline">Flush</Button>} />
      <PopoverContent padding="none">
        <div className="p-2">Flush content</div>
      </PopoverContent>
    </Popover>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Flush" }));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("Flush content")).toBeVisible();
  },
};
