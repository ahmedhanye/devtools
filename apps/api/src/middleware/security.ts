import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import {
  API_ERROR_CODES,
  type ApiErrorCode,
  type ApiErrorResponse,
  ApiErrorResponseSchema,
} from "@devtools/core";
import type { Server } from "bun";
import type { Context, MiddlewareHandler } from "hono";

/**
 * Hono environment bindings injected by the unified Bun HTTP server bootstrap.
 */
export interface ApiBindings {
  /** Live `Bun.serve` server handle used for peer IP checks and SSE timeout disabling. */
  server?: Server<unknown>;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);
const LOOPBACK_PEER_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:7f00:1",
]);
const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
  "[::ffff:127.0.0.1]",
  "::ffff:127.0.0.1",
  "[::ffff:7f00:1]",
  "::ffff:7f00:1",
]);
const LOOPBACK_ORIGIN_HOSTNAMES = LOOPBACK_HOSTNAMES;

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
  const hostname = header.slice(0, closingIndex + 1).toLowerCase();
  const inner = header.slice(1, closingIndex).toLowerCase();
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
  const lower = header.toLowerCase();
  if (
    lower === "::1" ||
    lower === "::ffff:127.0.0.1" ||
    lower === "::ffff:7f00:1"
  ) {
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
 * Verifies whether a socket peer IP address belongs to a local loopback interface.
 *
 * @param address - Peer IP address string (IPv4, IPv6, or IPv4-mapped IPv6).
 * @returns `true` if `address` represents a local loopback peer.
 */
export function isLoopbackAddress(address: string): boolean {
  if (!address || typeof address !== "string") {
    return false;
  }
  return LOOPBACK_PEER_ADDRESSES.has(address.trim().toLowerCase());
}

/**
 * Checks whether a peer IP matches a local loopback address or one of this machine's own
 * network interface addresses (supporting container/gVisor local NAT where `127.0.0.1` sockets
 * observe the host's primary interface IP).
 *
 * @param address - Normalized peer IP address from `server.requestIP`.
 * @param interfaces - Optional `os.networkInterfaces()` map seam for unit testing.
 * @returns `true` if `address` is strictly loopback or owned by a local network interface.
 */
export function isTrustedLoopbackPeer(
  address: string,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): boolean {
  if (isLoopbackAddress(address)) {
    return true;
  }
  const normalizedPeer = address.trim().toLowerCase();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.address.toLowerCase() === normalizedPeer) {
        return true;
      }
    }
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
 * (`localhost`, `127.0.0.1`, `[::1]`, or `[::ffff:127.0.0.1]`).
 *
 * @param origin - Raw `Origin` header URL string.
 * @returns `true` if `origin` is a valid `http:` or `https:` URL targeting loopback.
 */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    return isHttp && LOOPBACK_ORIGIN_HOSTNAMES.has(url.hostname.toLowerCase());
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

function evaluateLoopbackRequestViolation(
  c: Context<{ Bindings: ApiBindings }>,
): { status: 403 | 415; code: ApiErrorCode; message: string } | null {
  const server = c.env?.server;
  if (server && typeof server.requestIP === "function") {
    const peer = server.requestIP(c.req.raw);
    if (peer && !isTrustedLoopbackPeer(peer.address)) {
      return {
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN,
        message: "Non-loopback client address is forbidden",
      };
    }
  }

  const host = c.req.header("host");
  if (host && !isLoopbackHostHeader(host)) {
    return {
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN,
      message: "Non-loopback Host header is forbidden",
    };
  }

  if (c.req.header("sec-fetch-site")?.trim().toLowerCase() === "cross-site") {
    return {
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN,
      message: "Cross-site requests are forbidden",
    };
  }

  const origin = c.req.header("origin");
  if (origin && !isLoopbackOrigin(origin)) {
    return {
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN,
      message: "Non-loopback Origin is forbidden",
    };
  }

  if (MUTATING_METHODS.has(c.req.method) && hasNonJsonBody(c)) {
    return {
      status: 415,
      code: API_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      message:
        "Mutating requests with a body must use Content-Type: application/json",
    };
  }

  return null;
}

/**
 * Creates a Hono middleware enforcing loopback peer, Host, Origin, and CSRF boundaries
 * across all `/api/*` HTTP methods.
 *
 * @remarks
 * Protects the local loopback daemon against cross-site request forgery (CSRF),
 * cross-site GET/SSE data exfiltration, opaque sandboxed iframe requests (`Origin: null`),
 * and DNS rebinding by:
 * 1. Verifying `server.requestIP(req)` is a loopback address when a `Bun.serve` binding is present.
 * 2. Denying non-loopback `Host` headers on all HTTP methods.
 * 3. Denying `Sec-Fetch-Site: cross-site` and non-loopback `Origin` headers on all HTTP methods.
 * 4. Requiring `Content-Type: application/json` whenever a mutating request carries a payload.
 *
 * @returns Hono middleware handler.
 */
export function createLoopbackProtectionMiddleware(): MiddlewareHandler<{
  Bindings: ApiBindings;
}> {
  return async (c, next) => {
    const violation = evaluateLoopbackRequestViolation(c);
    if (violation) {
      return c.json(
        formatError(violation.code, violation.message),
        violation.status,
      );
    }
    await next();
  };
}
