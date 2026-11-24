import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "../input";
import { Label } from "./label";

const meta: Meta<typeof Label> = {
  title: "Shared/Shadcn/Label",
  component: Label,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = {
  render: () => (
    <div className="flex max-w-xs flex-col gap-2">
      <Label htmlFor="target-url">Target URL</Label>
      <Input id="target-url" placeholder="https://example.com/" />
    </div>
  ),
};
