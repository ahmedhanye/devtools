import type { Meta, StoryObj } from "@storybook/react";
import { DashboardPage } from "./dashboard-page";
import { ServiceStatusCard } from "./service-status-card";
import { ServiceStatusCardError } from "./service-status-card-error";
import { ServiceStatusCardSkeleton } from "./service-status-card-skeleton";

const meta: Meta<typeof DashboardPage> = {
  title: "Pages/DashboardPage",
  component: DashboardPage,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof DashboardPage>;

export const Default: Story = {
  args: {
    autoFetch: false,
  },
};

export const LivePolling: Story = {
  args: {
    autoFetch: true,
  },
};

export const ReadyVariant: StoryObj = {
  render: () => (
    <div className="max-w-md p-8">
      <ServiceStatusCard
        name="DevTools API Service"
        data={{
          status: "ok",
          timestamp: new Date().toISOString(),
          uptime: 3600,
          version: "0.1.0",
        }}
        onRefresh={() => {}}
      />
    </div>
  ),
};

export const SkeletonVariant: StoryObj = {
  render: () => (
    <div className="max-w-md p-8">
      <ServiceStatusCardSkeleton name="DevTools API Service" />
    </div>
  ),
};

export const ErrorVariant: StoryObj = {
  render: () => (
    <div className="max-w-md p-8">
      <ServiceStatusCardError
        name="DevTools API Service"
        error={new Error("Failed to connect to daemon at 127.0.0.1:4000")}
        onRefresh={() => {}}
      />
    </div>
  ),
};
