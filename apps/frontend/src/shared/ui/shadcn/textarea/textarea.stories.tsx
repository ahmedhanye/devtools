import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Textarea } from "./textarea";

const meta: Meta<typeof Textarea> = {
  title: "Shared/Shadcn/Textarea",
  component: Textarea,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    placeholder: "Enter diagnostic notes...",
  },
};
