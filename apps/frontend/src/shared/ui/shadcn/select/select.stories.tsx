import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

const meta: Meta<typeof Select> = {
  title: "Shared/Shadcn/Select",
  component: Select,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Select>;

const THROTTLING_ITEMS = {
  simulate: "Simulate (Lantern)",
  devtools: "DevTools (CDP)",
  provided: "Provided (Unthrottled)",
} as const;

export const Default: Story = {
  render: () => (
    <Select defaultValue="simulate" items={THROTTLING_ITEMS}>
      <SelectTrigger className="w-48" aria-label="Throttling method">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Throttling</SelectLabel>
          <SelectItem value="simulate">Simulate (Lantern)</SelectItem>
          <SelectItem value="devtools">DevTools (CDP)</SelectItem>
          <SelectSeparator />
          <SelectItem value="provided">Provided (Unthrottled)</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox", {
      name: "Throttling method",
    });
    await userEvent.click(trigger);

    const body = within(canvasElement.ownerDocument.body);
    const option = await body.findByRole("option", { name: "DevTools (CDP)" });
    await userEvent.click(option);
    await expect(trigger).toHaveTextContent("DevTools (CDP)");
  },
};
