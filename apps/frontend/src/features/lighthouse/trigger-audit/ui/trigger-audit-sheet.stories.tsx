import type * as React from "react";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { updateNativeSearchParams } from "@/shared/lib";
import { TriggerAuditSheet } from "./trigger-audit-sheet";

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

function StoryProviders({
  handler,
  children,
}: {
  handler: FetchHandler;
  children: React.ReactNode;
}) {
  const [state] = useState(() => {
    const previousFetch = globalThis.fetch;
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    const stubFetch: typeof fetch = Object.assign(
      (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        return handler(url, init);
      },
      { preconnect: previousFetch.preconnect },
    );
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

const SAMPLE_RUNS_RESPONSE = {
  runs: [
    {
      id: "run-1",
      url: "https://shop.example.com/",
      finalUrl: "https://shop.example.com/",
      formFactor: "mobile",
      throttlingMethod: "simulate",
      performanceScore: 88,
      accessibilityScore: 96,
      bestPracticesScore: 95,
      seoScore: 100,
      lcpMs: 2100,
      cls: 0.03,
      tbtMs: 110,
      fcpMs: 1050,
      siMs: 1800,
      ttfbMs: 250,
      durationMs: 4100,
      createdAt: "2026-11-22T01:00:00.000Z",
      hasHtmlReport: true,
    },
  ],
  total: 1,
  limit: 100,
  offset: 0,
};

function makeRunningJob(id = "job-active-1") {
  return {
    id,
    url: "https://shop.example.com/checkout",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    runs: 1,
    categories: ["performance", "accessibility", "best-practices", "seo"],
    status: "running",
    startedAt: "2026-11-22T02:00:00.000Z",
    completedAt: null,
    latestProgress: null,
    runId: null,
    error: null,
  };
}

const meta: Meta<typeof TriggerAuditSheet> = {
  title: "Features/Lighthouse/TriggerAuditSheet",
  component: TriggerAuditSheet,
  tags: ["autodocs"],
  parameters: {
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof TriggerAuditSheet>;

const interactiveTriggerHandler: FetchHandler = async (url, init) => {
  if (url === "/api/lighthouse/audits/active") {
    return new Response(JSON.stringify({ active: false, job: null }), {
      status: 200,
    });
  }
  if (url.startsWith("/api/lighthouse/runs")) {
    return new Response(JSON.stringify(SAMPLE_RUNS_RESPONSE), {
      status: 200,
    });
  }
  if (url === "/api/lighthouse/audits" && init?.method === "POST") {
    return new Response(
      JSON.stringify({ job: makeRunningJob("job-created-1") }),
      { status: 202 },
    );
  }
  return new Response(null, { status: 404 });
};

const activeJobHandler: FetchHandler = async (url) => {
  if (url === "/api/lighthouse/audits/active") {
    return new Response(
      JSON.stringify({
        active: true,
        job: makeRunningJob("job-live-42"),
      }),
      { status: 200 },
    );
  }
  if (url.startsWith("/api/lighthouse/runs")) {
    return new Response(JSON.stringify(SAMPLE_RUNS_RESPONSE), {
      status: 200,
    });
  }
  return new Response(null, { status: 404 });
};

export const InteractiveTrigger: Story = {
  args: {
    open: true,
    onOpenChange: fn(),
    onJobStarted: fn(),
  },
  render: (args) => (
    <StoryProviders handler={interactiveTriggerHandler}>
      <TriggerAuditSheet
        open={args.open}
        onOpenChange={args.onOpenChange}
        onJobStarted={args.onJobStarted}
      />
    </StoryProviders>
  ),
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const submitButton = await body.findByRole("button", {
      name: "Run Lighthouse Audit",
    });

    await userEvent.click(submitButton);
    await expect(
      await body.findByText("Target URL is required"),
    ).toBeInTheDocument();

    const presetBtn = await body.findByRole("button", {
      name: "shop.example.com/",
    });
    await userEvent.click(presetBtn);
    await expect(body.getByLabelText("Target URL")).toHaveValue(
      "https://shop.example.com/",
    );

    const urlInput = body.getByLabelText("Target URL");
    await userEvent.type(urlInput, "x");
    await userEvent.type(urlInput, "{backspace}");

    const desktopButton = body.getByRole("button", { name: /Desktop/i });
    await userEvent.click(desktopButton);

    await userEvent.click(body.getByText("Performance"));
    await userEvent.click(body.getByText("Accessibility"));
    await userEvent.click(body.getByText("Best Practices"));
    await userEvent.click(body.getByText("SEO"));
    await userEvent.click(submitButton);
    await expect(
      await body.findByText("Select at least one audit category"),
    ).toBeInTheDocument();

    await userEvent.click(body.getByText("Performance"));
    await userEvent.click(submitButton);
    await waitFor(async () => {
      await expect(args.onJobStarted).toHaveBeenCalledTimes(1);
    });
    await expect(args.onJobStarted).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-created-1" }),
    );
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const SubmitNavigatesAndHandlesErrors: Story = {
  args: {
    open: true,
    onOpenChange: fn(),
    initialUrl: "https://shop.example.com/",
  },
  render: (args) => {
    let postCount = 0;
    const handler: FetchHandler = async (url, init) => {
      if (url === "/api/lighthouse/audits/active") {
        return new Response(JSON.stringify({ active: false, job: null }), {
          status: 200,
        });
      }
      if (url.startsWith("/api/lighthouse/runs")) {
        return new Response(JSON.stringify(SAMPLE_RUNS_RESPONSE), {
          status: 200,
        });
      }
      if (url === "/api/lighthouse/audits" && init?.method === "POST") {
        postCount += 1;
        if (postCount === 1) {
          return new Response(
            JSON.stringify({
              error: { code: "INTERNAL", message: "Runner temporarily busy" },
            }),
            { status: 500 },
          );
        }
        if (postCount === 2) {
          return new Response(
            JSON.stringify({
              error: { code: "CONFLICT", message: "Locked without job id" },
            }),
            { status: 409 },
          );
        }
        return new Response(
          JSON.stringify({ job: makeRunningJob("job-nav-2") }),
          { status: 202 },
        );
      }
      return new Response(null, { status: 404 });
    };
    return (
      <StoryProviders handler={handler}>
        <TriggerAuditSheet
          open={args.open}
          onOpenChange={args.onOpenChange}
          initialUrl={args.initialUrl}
        />
      </StoryProviders>
    );
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const submitButton = await body.findByRole("button", {
      name: "Run Lighthouse Audit",
    });

    await userEvent.click(
      body.getByRole("combobox", { name: "Throttling Method" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "DevTools (CDP)" }),
    );

    await userEvent.click(
      body.getByRole("combobox", { name: "Batch Iterations" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "3 iterations (Median)" }),
    );

    await userEvent.click(submitButton);
    await expect(
      await body.findByText("Runner temporarily busy"),
    ).toBeInTheDocument();

    await userEvent.click(submitButton);
    await expect(
      await body.findByText("Locked without job id"),
    ).toBeInTheDocument();

    await userEvent.click(submitButton);
    await waitFor(async () => {
      await expect(args.onOpenChange).toHaveBeenCalledWith(false);
    });
  },
};

export const Conflict409OnSubmit: Story = {
  render: () => {
    const onOpenChange = fn();
    let activeNow = false;
    const handler: FetchHandler = async (url, init) => {
      if (url === "/api/lighthouse/audits/active") {
        return new Response(
          JSON.stringify(
            activeNow
              ? { active: true, job: makeRunningJob("job-conflict-99") }
              : { active: false, job: null },
          ),
          { status: 200 },
        );
      }
      if (url.startsWith("/api/lighthouse/runs")) {
        return new Response(JSON.stringify(SAMPLE_RUNS_RESPONSE), {
          status: 200,
        });
      }
      if (url === "/api/lighthouse/audits" && init?.method === "POST") {
        activeNow = true;
        return new Response(
          JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "An audit job is already in progress",
              details: { activeJobId: "job-conflict-99" },
            },
          }),
          { status: 409 },
        );
      }
      return new Response(null, { status: 404 });
    };
    return (
      <StoryProviders handler={handler}>
        <TriggerAuditSheet
          open
          onOpenChange={onOpenChange}
          initialUrl="https://shop.example.com/"
        />
      </StoryProviders>
    );
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const submitButton = await body.findByRole("button", {
      name: "Run Lighthouse Audit",
    });
    await userEvent.click(submitButton);

    const liveLink = await body.findByRole("link", {
      name: "View live progress",
    });
    await expect(liveLink).toHaveAttribute(
      "href",
      "/lighthouse/run?job=job-conflict-99",
    );
    await expect(
      body.getByRole("button", { name: "Audit Job Active..." }),
    ).toBeDisabled();
  },
};

export const ActiveJobAlreadyRunning: Story = {
  args: {
    open: true,
    onOpenChange: fn(),
  },
  render: (args) => (
    <StoryProviders handler={activeJobHandler}>
      <TriggerAuditSheet open={args.open} onOpenChange={args.onOpenChange} />
    </StoryProviders>
  ),
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByText("Audit Job already in progress"),
    ).toBeInTheDocument();
    await expect(
      body.getByRole("button", { name: "Audit Job Active..." }),
    ).toBeDisabled();
    await userEvent.click(body.getByRole("button", { name: "Cancel" }));
    await expect(args.onOpenChange).toHaveBeenCalledWith(
      false,
      expect.anything(),
    );
  },
};

export const SameRouteBlockerAlertUpdatesSearchParams: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/lighthouse/run" },
    },
  },
  args: {
    open: true,
    onOpenChange: fn(),
  },
  render: (args) => {
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
      <StoryProviders handler={activeJobHandler}>
        <TriggerAuditSheet open={args.open} onOpenChange={args.onOpenChange} />
      </StoryProviders>
    );
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const liveLink = await body.findByRole("link", {
      name: "View live progress",
    });
    const modifiedEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    liveLink.dispatchEvent(modifiedEvent);
    await expect(window.location.search).toBe("?id=run-1");
    await expect(args.onOpenChange).not.toHaveBeenCalled();

    await userEvent.click(liveLink);
    await expect(window.location.search).toBe("?job=job-live-42");
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};
