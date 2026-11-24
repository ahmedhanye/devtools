import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "@/shared/api";
import {
  extractConflictJobId,
  getSubmitErrorMessage,
  useTriggerAuditForm,
} from "./use-trigger-audit-form";

vi.mock("next/navigation", () => ({
  usePathname: () => "/lighthouse",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe("useTriggerAuditForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("extracts 409 activeJobId conflicts and formats submission error messages", () => {
    const conflict = new ApiRequestError({
      status: 409,
      code: "CONFLICT",
      message: "Audit already running",
      details: { activeJobId: "job-active-1" },
    });
    expect(extractConflictJobId(conflict)).toBe("job-active-1");
    expect(
      extractConflictJobId(
        new ApiRequestError({ status: 400, code: "BAD", message: "Bad" }),
      ),
    ).toBeNull();
    expect(extractConflictJobId(new Error("boom"))).toBeNull();

    expect(getSubmitErrorMessage("Bad URL", null, null)).toBe("Bad URL");
    expect(getSubmitErrorMessage(null, conflict, "job-active-1")).toBeNull();
    expect(getSubmitErrorMessage(null, new Error("Network down"), null)).toBe(
      "Network down",
    );
    expect(getSubmitErrorMessage(null, "unknown", null)).toBe(
      "Failed to start Audit Job",
    );
  });

  it("validates fields, toggles categories, and submits audit requests", async () => {
    const onClose = vi.fn();
    const onJobStarted = vi.fn();
    const fetchSpy = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.includes("/api/lighthouse/audits/active")) {
          return new Response(JSON.stringify({ active: false, job: null }), {
            status: 200,
          });
        }
        if (url.includes("/api/lighthouse/runs")) {
          return new Response(JSON.stringify({ runs: [], total: 0 }), {
            status: 200,
          });
        }
        if (url.includes("/api/lighthouse/audits") && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              job: {
                id: "job-new-1",
                url: "https://example.com/",
                formFactor: "mobile",
                throttlingMethod: "devtools",
                runs: 3,
                categories: ["performance"],
                status: "running",
                startedAt: "2026-11-22T02:00:00.000Z",
                completedAt: null,
                latestProgress: null,
                runId: null,
                error: null,
              },
            }),
            { status: 202 },
          );
        }
        return new Response("{}", { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchSpy);

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(
      () =>
        useTriggerAuditForm({
          initialUrl: "not-a-url",
          onClose,
          onJobStarted,
        }),
      { wrapper: createWrapper(client) },
    );

    act(() => {
      result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>);
    });
    expect(result.current.submissionErrorMessage).toBeTruthy();

    act(() => {
      result.current.handleUrlChange({
        target: { value: "https://example.com/" },
      } as React.ChangeEvent<HTMLInputElement>);
      result.current.handleThrottlingChange("devtools");
      result.current.handleRunsChange("3");
      result.current.handleToggleCategory("seo");
      result.current.handleToggleCategory("seo");
    });

    expect(result.current.throttlingMethod).toBe("devtools");
    expect(result.current.runs).toBe("3");

    act(() => {
      result.current.handleThrottlingChange(null);
      result.current.handleThrottlingChange("invalid");
      result.current.handleRunsChange(null);
      result.current.handleRunsChange("99");
    });

    expect(result.current.throttlingMethod).toBe("devtools");
    expect(result.current.runs).toBe("3");

    act(() => {
      result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>);
    });

    await waitFor(() => expect(onJobStarted).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onJobStarted.mock.calls[0]?.[0]?.id).toBe("job-new-1");
  });
});
