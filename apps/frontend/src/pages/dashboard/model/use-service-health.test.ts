import type { HealthResponse } from "@devtools/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useServiceHealth } from "./use-service-health";

describe("useServiceHealth hook", () => {
  it("provides fallback initial data safely without throwing", () => {
    const { result } = renderHook(() =>
      useServiceHealth({
        autoFetch: false,
      }),
    );

    expect(result.current.data).toBeNull();
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("fetches health data and updates state on mount", async () => {
    const mockData: HealthResponse = {
      status: "ok",
      timestamp: "2026-10-01T12:00:00.000Z",
      uptime: 120,
      version: "1.0.0",
    };

    const mockFetcher = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() =>
      useServiceHealth({
        fetchFn: mockFetcher,
        autoFetch: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData);
      expect(result.current.status).toBe("success");
      expect(result.current.error).toBeNull();
    });
  });

  it("captures errors when fetch fails without crashing", async () => {
    const mockFetcher = vi
      .fn()
      .mockRejectedValue(new Error("Network connection refused"));

    const { result } = renderHook(() =>
      useServiceHealth({
        fetchFn: mockFetcher,
        autoFetch: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.error?.message).toBe("Network connection refused");
      expect(result.current.status).toBe("error");
      expect(result.current.data).toBeNull();
    });
  });

  it("allows manual refresh", async () => {
    let callCount = 0;
    const mockFetcher = vi.fn().mockImplementation(async () => {
      callCount += 1;
      return {
        status: "ok",
        timestamp: "2026-10-01T12:00:00.000Z",
        uptime: callCount * 10,
        version: "1.0.0",
      } satisfies HealthResponse;
    });

    const { result } = renderHook(() =>
      useServiceHealth({
        fetchFn: mockFetcher,
        autoFetch: false,
      }),
    );

    expect(result.current.data).toBeNull();
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.status).toBe("success");
    expect(result.current.data?.uptime).toBe(10);
  });

  it("safely ignores DOM event arguments passed to refresh", async () => {
    const mockFetcher = vi.fn().mockResolvedValue({
      status: "ok",
      timestamp: "2026-10-01T12:00:00.000Z",
      uptime: 50,
      version: "1.0.0",
    });

    const { result } = renderHook(() =>
      useServiceHealth({
        fetchFn: mockFetcher,
        autoFetch: false,
      }),
    );

    await act(async () => {
      // Simulate button click passing a MouseEvent or non-AbortSignal
      // @ts-expect-error simulating DOM event argument
      await result.current.refresh({ preventDefault: () => {} });
    });

    expect(mockFetcher).toHaveBeenCalledWith({
      endpoint: "/api/health",
      signal: undefined,
    });
    expect(result.current.status).toBe("success");
  });
});
