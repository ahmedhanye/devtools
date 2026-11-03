import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { AppLayout } from "./app-layout";

const meta: Meta<typeof AppLayout> = {
  title: "Shared/Blocks/AppLayout",
  component: AppLayout,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
    },
  },
  decorators: [
    (Story) => {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("sidebar_state");
      }
      return <Story />;
    },
  ],
};

export default meta;
type Story = StoryObj<typeof AppLayout>;

export const Default: Story = {
  args: {
    children: (
      <div className="flex min-h-75 flex-1 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
        <h2 className="text-foreground text-lg font-semibold tracking-tight">
          Page Content Area
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Interactive shell preview with collapsible sidebar and responsive
          navigation.
        </p>
      </div>
    ),
  },
};

export const InteractiveSidebarToggle: Story = {
  args: {
    ...Default.args,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /toggle sidebar/i });

    await expect(trigger).toBeInTheDocument();
    await userEvent.click(trigger);
    const sidebar = canvasElement.querySelector('[data-slot="sidebar"]');
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  },
};
