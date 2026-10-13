import type { Meta, StoryObj } from "@storybook/react";
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
