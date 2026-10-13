import type { Meta, StoryObj } from "@storybook/react";
import { DashboardPage } from "./page";

const meta: Meta<typeof DashboardPage> = {
  title: "Pages/Dashboard/Page",
  component: DashboardPage,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-screen flex-col p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DashboardPage>;

export const Default: Story = {};
