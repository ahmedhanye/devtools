import { describe, expect, it, vi } from "vitest";
import { ApiRequestError, fetchJson } from "./http-client";

const SampleSchema = {
  parse(val: unknown): { ok: boolean; count: number } {
    if (
      typeof val !== "object" ||
      val === null ||
      !("ok" in val) ||
      typeof val.ok !== "boolean" ||
      !("count" in val) ||
      typeof val.count !== "number"
    ) {
      throw new Error("Invalid sample payload");
    }
    return { ok: val.ok, count: val.count };
  },
};

describe("fetchJson & ApiRequestError", () => {
  it("fetches JSON and validates payload against the provided schema", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 3 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchJson("/api/sample", {
      schema: SampleSchema,
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ ok: true, count: 3 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sample",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("serializes JSON request bodies with Content-Type and forwards AbortSignal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 1 }), {
        status: 202,
      }),
    );

    await fetchJson("/api/sample", {
      method: "POST",
      body: { url: "https://example.com/" },
      signal: controller.signal,
      schema: SampleSchema,
      fetchImpl: fetchMock,
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ url: "https://example.com/" }));
    expect(init?.signal).toBe(controller.signal);
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("throws ApiRequestError with parsed ApiErrorResponse envelope details on non-2xx responses", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "CONFLICT",
            message: "An audit job is already in progress",
            details: { activeJobId: "job-123" },
          },
        }),
        { status: 409, statusText: "Conflict" },
      ),
    );

    await expect(
      fetchJson("/api/lighthouse/audits", {
        method: "POST",
        body: { url: "https://example.com/" },
        schema: SampleSchema,
        fetchImpl: fetchMock,
      }),
    ).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 409,
      code: "CONFLICT",
      message: "An audit job is already in progress",
      details: { activeJobId: "job-123" },
    });
  });

  it("falls back to HTTP_ERROR on non-JSON or non-envelope error responses", async () => {
    const textErrorFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" }),
      );

    await expect(
      fetchJson("/api/sample", {
        schema: SampleSchema,
        fetchImpl: textErrorFetch,
      }),
    ).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 502,
      code: "HTTP_ERROR",
      message: "Bad Gateway",
    });

    const emptyStatusFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ unexpected: true }), { status: 500 }),
      );

    await expect(
      fetchJson("/api/sample", {
        schema: SampleSchema,
        fetchImpl: emptyStatusFetch,
      }),
    ).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 500,
      code: "HTTP_ERROR",
      message: "Request failed with status 500",
    });

    const instanceErr = await fetchJson("/api/sample", {
      schema: SampleSchema,
      fetchImpl: emptyStatusFetch,
    }).catch((err: unknown) => err);
    expect(instanceErr).toBeInstanceOf(ApiRequestError);
  });

  it("validates omitted fetchImpl default path cleanly", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: false, count: 0 }), { status: 200 }),
      );
    try {
      const res = await fetchJson("/api/sample", { schema: SampleSchema });
      expect(res).toEqual({ ok: false, count: 0 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
