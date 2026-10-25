import { z } from "zod";

/**
 * Canonical machine-readable error codes returned by the DevTools HTTP API.
 *
 * @remarks
 * Every non-2xx JSON response emitted by `@devtools/api` uses one of these
 * constant codes inside {@link ApiErrorResponse}.
 */
export const API_ERROR_CODES = {
  /** The client request payload, headers, or query parameters failed validation. */
  BAD_REQUEST: "BAD_REQUEST",
  /** The requested API endpoint or domain resource does not exist. */
  NOT_FOUND: "NOT_FOUND",
  /** An unhandled exception occurred while processing the request. */
  INTERNAL_ERROR: "INTERNAL_ERROR",
  /** A required subsystem or backing dependency is temporarily unavailable. */
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

/**
 * Union type of standard machine-readable API error code literals.
 */
export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/**
 * Zod schema validating structured HTTP error responses across API boundaries.
 *
 * @remarks
 * Enforces a top-level `{ error: { code, message, details? } }` envelope with
 * strict key validation so unexpected properties are rejected.
 */
export const ApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        /** Machine-readable error identifier (see {@link API_ERROR_CODES}). */
        code: z.string().min(1),
        /** Human-readable diagnostic explanation of the failure. */
        message: z.string().min(1),
        /** Optional structured diagnostic context or validation issue details. */
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

/**
 * Structured error payload inferred from {@link ApiErrorResponseSchema}.
 */
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
