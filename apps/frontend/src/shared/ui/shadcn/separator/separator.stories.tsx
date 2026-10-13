import type { Meta, StoryObj } from "@storybook/react";
import { Separator } from "./separator";

const meta: Meta<typeof Separator> = {
  title: "Shared/Shadcn/Separator",
  component: Separator,
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: (args) => (
    <div className="w-80 space-y-4">
      <div>
        <h4 className="text-sm leading-none font-medium">DevTools Header</h4>
        <p className="text-muted-foreground text-sm">
          Navigation bar description
        </p>
      </div>
      <Separator {...args} />
      <div className="text-muted-foreground text-sm">
        Content below separator
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  args: {
    orientation: "vertical",
  },
  render: (args) => (
    <div className="flex h-5 items-center space-x-4 text-sm">
      <div>Item 1</div>
      <Separator {...args} />
      <div>Item 2</div>
      <Separator {...args} />
      <div>Item 3</div>
    </div>
  ),
};
