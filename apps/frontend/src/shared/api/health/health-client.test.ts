import { describe, expect, it, vi } from "vitest";
import { fetchServiceHealth } from "./health-client";

describe("health client & fixtures", () => {
  it("fetches and returns validated HealthResponse", async () => {
    const mockPayload = {
      status: "ok",
      timestamp: "2026-10-01T12:00:00.000Z",
      uptime: 3600,
      version: "0.1.0",
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPayload,
    } as Response);

    const result = await fetchServiceHealth({
      endpoint: "/api/health",
      fetchFn: mockFetch,
    });

    expect(result).toEqual(mockPayload);
    expect(mockFetch).toHaveBeenCalledWith("/api/health", expect.any(Object));
  });

  it("rejects when response fails domain schema validation", async () => {
    const invalidPayload = {
      status: "not-a-valid-status",
      timestamp: "invalid-date",
      uptime: -5,
      version: "",
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => invalidPayload,
    } as Response);

    await expect(
      fetchServiceHealth({
        endpoint: "/api/health",
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow();
  });

  it("rejects when HTTP status is not ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as Response);

    await expect(
      fetchServiceHealth({
        endpoint: "/api/health",
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow(/HTTP 503/);
  });
});
