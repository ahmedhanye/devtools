import { type ApiErrorResponse, ApiErrorResponseSchema } from "@devtools/core";
import type { Context } from "hono";

/**
 * HTTP error status codes emitted by structured JSON error responses.
 */
export type ApiErrorHttpStatus = 400 | 403 | 404 | 409 | 415 | 422 | 500 | 503;

/**
 * Constructs and schema-validates a canonical {@link ApiErrorResponse} envelope.
 *
 * @param code - Machine-readable error code.
 * @param message - Human-readable diagnostic message.
 * @param details - Optional structured validation or diagnostic details.
 * @returns Validated {@link ApiErrorResponse} payload.
 */
export function formatError(
  code: string,
  message: string,
  details?: unknown,
): ApiErrorResponse {
  return ApiErrorResponseSchema.parse({
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  });
}

/**
 * Serializes a canonical {@link ApiErrorResponse} payload onto a Hono JSON response.
 */
export function jsonApiError<S extends ApiErrorHttpStatus>(
  c: Context,
  status: S,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json(formatError(code, message, details), status);
}
