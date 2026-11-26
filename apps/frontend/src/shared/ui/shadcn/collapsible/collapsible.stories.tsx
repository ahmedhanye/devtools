import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "../button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible";

const meta: Meta<typeof Collapsible> = {
  title: "Shared/Shadcn/Collapsible",
  component: Collapsible,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Collapsible>;

export const Default: Story = {
  render: () => (
    <Collapsible className="w-80 space-y-2">
      <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
        Toggle details
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-md border border-border px-3 py-2 text-xs">
        Expanded diagnostic details
      </CollapsibleContent>
    </Collapsible>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Toggle details" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText("Expanded diagnostic details")).toBeVisible();
  },
};

export const DefaultOpen: Story = {
  render: () => (
    <Collapsible defaultOpen className="w-80 space-y-2">
      <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
        Hide details
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-md border border-border px-3 py-2 text-xs">
        Visible on initial render
      </CollapsibleContent>
    </Collapsible>
  ),
};
