import type * as React from "react";
import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { QueryProvider } from "../../providers/query-provider";
import { AppShell } from "./app-shell";

function ShellFetchMock({ children }: { children: React.ReactNode }) {
  const [state] = useState(() => {
    const previousFetch = globalThis.fetch;
    const stubFetch: typeof fetch = Object.assign(
      async () =>
        new Response(
          JSON.stringify({
            active: true,
            job: {
              id: "job-shell-1",
              url: "https://shop.example.com/",
              formFactor: "mobile",
              throttlingMethod: "simulate",
              runs: 1,
              categories: ["performance"],
              status: "running",
              startedAt: "2026-11-22T02:00:00.000Z",
              completedAt: null,
              latestProgress: null,
              runId: null,
              error: null,
            },
          }),
          { status: 200 },
        ),
      { preconnect: previousFetch.preconnect },
    );
    globalThis.fetch = stubFetch;
    return { previousFetch, stubFetch };
  });

  useEffect(() => {
    return () => {
      if (globalThis.fetch === state.stubFetch) {
        globalThis.fetch = state.previousFetch;
      }
    };
  }, [state]);

  return <QueryProvider>{children}</QueryProvider>;
}

const meta: Meta<typeof AppShell> = {
  title: "App/Layouts/AppShell",
  component: AppShell,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => {
      if (typeof document !== "undefined") {
        document.cookie =
          "sidebar_state=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      }
      return <Story />;
    },
  ],
};

export default meta;
type Story = StoryObj<typeof AppShell>;

export const DashboardBreadcrumb: Story = {
  render: () => (
    <ShellFetchMock>
      <AppShell>
        <div>Dashboard slot</div>
      </AppShell>
    </ShellFetchMock>
  ),
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: "/" } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Dashboard slot")).toBeInTheDocument();
    await expect(
      await canvas.findByRole("link", {
        name: /Running Audit Job for shop\.example\.com\//i,
      }),
    ).toBeInTheDocument();
  },
};

export const LighthouseHistoryBreadcrumb: Story = {
  render: () => (
    <ShellFetchMock>
      <AppShell>
        <div>History slot</div>
      </AppShell>
    </ShellFetchMock>
  ),
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: "/lighthouse" } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Audit History")).toBeInTheDocument();
  },
};

export const LighthouseCompareBreadcrumb: Story = {
  render: () => (
    <ShellFetchMock>
      <AppShell>
        <div>Compare slot</div>
      </AppShell>
    </ShellFetchMock>
  ),
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/lighthouse/compare" },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Compare Runs")).toBeInTheDocument();
  },
};

export const LighthouseRunBreadcrumb: Story = {
  render: () => (
    <ShellFetchMock>
      <AppShell>
        <div>Run slot</div>
      </AppShell>
    </ShellFetchMock>
  ),
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/lighthouse/run" },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Audit Run")).toBeInTheDocument();
  },
};

export const UnknownRouteAndSidebarToggle: Story = {
  render: () => (
    <ShellFetchMock>
      <AppShell>
        <div>Settings slot</div>
      </AppShell>
    </ShellFetchMock>
  ),
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/lighthouse/settings" },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Settings")).toBeInTheDocument();
    const toggle = canvas.getByRole("button", { name: /Toggle Sidebar/i });
    await userEvent.click(toggle);
    await expect(toggle).toBeInTheDocument();
  },
};

export const SingleSegmentUnknownRoute: Story = {
  render: () => (
    <ShellFetchMock>
      <AppShell>
        <div>Logs slot</div>
      </AppShell>
    </ShellFetchMock>
  ),
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/logs" },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Logs")).toBeInTheDocument();
  },
};
