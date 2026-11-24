import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./command";

const meta: Meta<typeof Command> = {
  title: "Shared/Shadcn/Command",
  component: Command,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Command>;

export const Default: Story = {
  render: () => (
    <Command className="max-w-xs rounded-lg border shadow-md">
      <CommandInput placeholder="Filter URLs..." />
      <CommandList>
        <CommandEmpty>No matching URL.</CommandEmpty>
        <CommandGroup heading="URLs">
          <CommandItem>
            example.com
            <CommandShortcut>⌘1</CommandShortcut>
          </CommandItem>
          <CommandSeparator />
          <CommandItem>localhost:3000</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByPlaceholderText("Filter URLs...");
    await userEvent.type(input, "nonexistent");
    await expect(canvas.getByText("No matching URL.")).toBeVisible();
  },
};

export const InDialog: Story = {
  render: () => (
    <CommandDialog open>
      <Command>
        <CommandInput placeholder="Search..." />
        <CommandList>
          <CommandEmpty>No matching command.</CommandEmpty>
          <CommandGroup heading="Quick">
            <CommandItem>Open History</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText("Open History")).toBeVisible();
    const input = body.getByPlaceholderText("Search...");
    await userEvent.type(input, "missing");
    await expect(body.getByText("No matching command.")).toBeVisible();
  },
};
