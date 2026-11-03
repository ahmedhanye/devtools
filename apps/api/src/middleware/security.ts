import {
  API_ERROR_CODES,
  type ApiErrorResponse,
  ApiErrorResponseSchema,
} from "@devtools/core";
import type { Context, MiddlewareHandler } from "hono";

const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isValidPortNumber(portStr: string): boolean {
  if (!/^\d+$/.test(portStr)) {
    return false;
  }
  const port = Number.parseInt(portStr, 10);
  return port >= 1 && port <= 65535;
}

function parseBracketedHost(header: string): boolean {
  const closingIndex = header.indexOf("]");
  if (closingIndex === -1) {
    return false;
  }
  const hostname = header.slice(0, closingIndex + 1);
  const inner = header.slice(1, closingIndex);
  if (!LOOPBACK_HOSTNAMES.has(hostname) && !LOOPBACK_HOSTNAMES.has(inner)) {
    return false;
  }
  const rest = header.slice(closingIndex + 1);
  if (!rest) {
    return true;
  }
  if (!rest.startsWith(":")) {
    return false;
  }
  return isValidPortNumber(rest.slice(1));
}

function parseStandardHost(header: string): boolean {
  if (header === "::1") {
    return true;
  }
  const parts = header.split(":");
  if (parts.length === 1 && parts[0] !== undefined) {
    return LOOPBACK_HOSTNAMES.has(parts[0].toLowerCase());
  }
  if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
    const hostname = parts[0];
    const portStr = parts[1];
    if (!LOOPBACK_HOSTNAMES.has(hostname.toLowerCase())) {
      return false;
    }
    return isValidPortNumber(portStr);
  }
  return false;
}

/**
 * Verifies whether an incoming HTTP `Host` header targets a trusted local loopback interface.
 *
 * @param hostHeader - Raw `Host` header string (for example, `"localhost:4000"` or `"[::1]:3000"`).
 * @returns `true` if `hostHeader` resolves to a valid loopback hostname.
 */
export function isLoopbackHostHeader(hostHeader: string): boolean {
  if (!hostHeader || typeof hostHeader !== "string") {
    return false;
  }
  const trimmed = hostHeader.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("[")) {
    return parseBracketedHost(trimmed);
  }
  return parseStandardHost(trimmed);
}

/**
 * Verifies whether a request `Origin` header belongs to a trusted local loopback interface
 * (`localhost`, `127.0.0.1`, or IPv6 `[::1]`).
 *
 * @param origin - Raw `Origin` header URL string.
 * @returns `true` if `origin` is a valid `http:` or `https:` URL targeting loopback.
 */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    return isHttp && LOOPBACK_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Constructs and schema-validates a canonical {@link ApiErrorResponse} envelope.
 *
 * @param code - Machine-readable error code (see {@link API_ERROR_CODES}).
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
 * Checks whether an incoming HTTP request carries a non-empty body requiring JSON content-type validation.
 */
function hasNonJsonBody(c: Context): boolean {
  const contentLength = c.req.header("content-length");
  const hasBody =
    c.req.raw.body !== null ||
    (contentLength !== undefined && contentLength !== "0") ||
    c.req.header("transfer-encoding") !== undefined;
  if (!hasBody) {
    return false;
  }
  const contentType = c.req.header("content-type") ?? "";
  const mimeType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return mimeType !== "application/json";
}

/**
 * Validates mutating HTTP requests against CSRF and loopback origin rules.
 */
function evaluateMutatingRequestViolation(
  c: Context,
): { status: 403 | 415; message: string } | null {
  if (c.req.header("sec-fetch-site") === "cross-site") {
    return {
      status: 403,
      message: "Cross-site mutating requests are forbidden",
    };
  }

  const origin = c.req.header("origin");
  if (origin && !isLoopbackOrigin(origin)) {
    return {
      status: 403,
      message: "Non-loopback Origin is forbidden",
    };
  }

  if (hasNonJsonBody(c)) {
    return {
      status: 415,
      message:
        "Mutating requests with a body must use Content-Type: application/json",
    };
  }

  return null;
}

/**
 * Creates a Hono middleware enforcing loopback origin and CSRF boundaries on mutating verbs
 * (`POST`, `PUT`, `DELETE`, `PATCH`).
 *
 * @remarks
 * Protects the local loopback daemon against cross-site request forgery (CSRF) and
 * DNS rebinding / malicious browser tab requests by:
 * 1. Denying requests with `Sec-Fetch-Site: cross-site`.
 * 2. Denying requests with a non-loopback `Origin` header.
 * 3. Requiring `Content-Type: application/json` whenever a request payload is sent.
 *
 * @returns Hono middleware handler.
 */
export function createLoopbackProtectionMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header("host");
    if (host && !isLoopbackHostHeader(host)) {
      return c.json(
        formatError(
          API_ERROR_CODES.FORBIDDEN,
          "Non-loopback Host header is forbidden",
        ),
        403,
      );
    }

    if (MUTATING_METHODS.has(c.req.method)) {
      const violation = evaluateMutatingRequestViolation(c);
      if (violation) {
        const errorCode =
          violation.status === 403
            ? API_ERROR_CODES.FORBIDDEN
            : API_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE;
        return c.json(
          formatError(errorCode, violation.message),
          violation.status,
        );
      }
    }
    await next();
  };
}
