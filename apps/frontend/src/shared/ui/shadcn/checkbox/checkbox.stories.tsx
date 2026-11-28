import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Label } from "../label";
import { Checkbox } from "./checkbox";

const meta: Meta<typeof Checkbox> = {
  title: "Shared/Shadcn/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  args: {
    "aria-label": "Include performance category",
  },
};

export const CheckedAndDisabled: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="chk-checked" defaultChecked />
        <Label htmlFor="chk-checked">Performance</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="chk-disabled" disabled />
        <Label htmlFor="chk-disabled">Disabled</Label>
      </div>
    </div>
  ),
};

export const InteractiveToggle: Story = {
  args: {
    "aria-label": "Toggle category",
    onCheckedChange: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox", { name: "Toggle category" });
    await expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledTimes(1);
  },
};
