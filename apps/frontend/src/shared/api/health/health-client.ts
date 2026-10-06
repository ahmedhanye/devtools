import { type HealthResponse, HealthResponseSchema } from "@devtools/core";

export interface FetchHealthOptions {
  endpoint?: string;
  fetchFn?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}

export async function fetchServiceHealth(
  options: FetchHealthOptions = {},
): Promise<HealthResponse> {
  const endpoint = options.endpoint ?? "/api/health";
  const fetcher = options.fetchFn ?? fetch;

  const res = await fetcher(endpoint, {
    signal: options.signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Health check request failed with HTTP ${res.status}`);
  }

  const data = await res.json();
  return HealthResponseSchema.parse(data);
}
