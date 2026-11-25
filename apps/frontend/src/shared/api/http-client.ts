import { ApiErrorResponseSchema } from "@devtools/core";

/**
 * Structured HTTP error thrown by {@link fetchJson} on non-2xx responses.
 */
export class ApiRequestError extends Error {
  /** HTTP response status code. */
  readonly status: number;
  /** Machine-readable API error code (`API_ERROR_CODES` or `"HTTP_ERROR"`). */
  readonly code: string;
  /** Optional structured error context from `{ error.details }`. */
  readonly details?: unknown;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "ApiRequestError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
  }
}

async function parseErrorResponse(
  response: Response,
): Promise<ApiRequestError> {
  let rawBody: unknown;
  try {
    rawBody = await response.json();
  } catch {
    rawBody = null;
  }

  const parsed = ApiErrorResponseSchema.safeParse(rawBody);
  if (parsed.success) {
    return new ApiRequestError({
      status: response.status,
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      details: parsed.data.error.details,
    });
  }

  return new ApiRequestError({
    status: response.status,
    code: "HTTP_ERROR",
    message:
      response.statusText || `Request failed with status ${response.status}`,
  });
}

/**
 * Executes a same-origin JSON HTTP request, surfaces structured {@link ApiRequestError} envelopes
 * on non-2xx responses, and validates 2xx payloads against a Zod or boundary schema.
 *
 * @param url - Relative API path such as `/api/lighthouse/runs`.
 * @param options - Request method, body, abort signal, validation schema, and optional `fetchImpl` seam.
 * @returns Schema-validated response payload.
 * @throws {@link ApiRequestError} When the HTTP response status is outside `200–299`.
 */
export async function fetchJson<T>(
  url: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
    schema: { parse: (value: unknown) => T };
    fetchImpl?: typeof fetch;
  },
): Promise<T> {
  const fetcher = options.fetchImpl ?? globalThis.fetch;
  const method = options.method ?? "GET";
  const headers = new Headers();
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetcher(url, {
    method,
    headers,
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
    signal: options.signal,
  });

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  const payload: unknown = await response.json();
  return options.schema.parse(payload);
}
