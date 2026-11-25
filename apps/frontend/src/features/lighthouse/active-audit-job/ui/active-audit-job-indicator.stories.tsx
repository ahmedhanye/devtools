import type * as React from "react";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { updateNativeSearchParams } from "@/shared/lib";
import { ActiveAuditJobIndicator } from "./active-audit-job-indicator";

type FetchHandler = () => Promise<Response>;

function IndicatorProviders({
  handler,
  children,
}: {
  handler: FetchHandler;
  children: React.ReactNode;
}) {
  const [state] = useState(() => {
    const previousFetch = globalThis.fetch;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const stubFetch: typeof fetch = Object.assign(() => handler(), {
      preconnect: previousFetch.preconnect,
    });
    globalThis.fetch = stubFetch;
    return { client, previousFetch, stubFetch };
  });

  useEffect(() => {
    return () => {
      if (globalThis.fetch === state.stubFetch) {
        globalThis.fetch = state.previousFetch;
      }
      state.client.clear();
    };
  }, [state]);

  return (
    <QueryClientProvider client={state.client}>{children}</QueryClientProvider>
  );
}

const meta: Meta<typeof ActiveAuditJobIndicator> = {
  title: "Features/Lighthouse/ActiveAuditJobIndicator",
  component: ActiveAuditJobIndicator,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ActiveAuditJobIndicator>;

const runningHandler: FetchHandler = async () =>
  new Response(
    JSON.stringify({
      active: true,
      job: {
        id: "job-hdr-1",
        url: "https://shop.example.com/",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        runs: 1,
        categories: ["performance"],
        status: "running",
        startedAt: "2026-11-22T02:00:00.000Z",
        completedAt: null,
        latestProgress: {
          jobId: "job-hdr-1",
          status: "running",
          stage: "analyzing",
          message: "Collecting traces",
          timestamp: "2026-11-22T02:00:05.000Z",
        },
        runId: null,
        error: null,
      },
    }),
    { status: 200 },
  );

const idleHandler: FetchHandler = async () =>
  new Response(JSON.stringify({ active: false, job: null }), {
    status: 200,
  });

export const ActiveRunningJob: Story = {
  render: () => (
    <IndicatorProviders handler={runningHandler}>
      <ActiveAuditJobIndicator />
    </IndicatorProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = await canvas.findByRole("link", {
      name: /Running Audit Job for shop\.example\.com\//i,
    });
    await expect(pill).toHaveAttribute("href", "/lighthouse/run?job=job-hdr-1");
    await expect(pill).toHaveTextContent("Running · 80%");
    await userEvent.click(pill);
  },
};

export const IdleNoIndicator: Story = {
  render: () => (
    <IndicatorProviders handler={idleHandler}>
      <ActiveAuditJobIndicator />
    </IndicatorProviders>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
  },
};

export const SameRouteUpdatesNativeSearchParams: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/lighthouse/run" },
    },
  },
  render: () => {
    const [prevHref] = useState(() => {
      const prev = window.location.href;
      updateNativeSearchParams("?id=run-1", { replace: true });
      return prev;
    });
    useEffect(() => {
      return () => {
        window.history.replaceState({}, "", prevHref);
      };
    }, [prevHref]);
    return (
      <IndicatorProviders handler={runningHandler}>
        <ActiveAuditJobIndicator />
      </IndicatorProviders>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(window.location.search).toBe("?id=run-1");
    const pill = await canvas.findByRole("link", {
      name: /Running Audit Job for shop\.example\.com\//i,
    });
    await userEvent.click(pill);
    await expect(window.location.search).toBe("?job=job-hdr-1");
  },
};
