import pkg from "../package.json";
import { z } from "zod";

/**
 * Canonical semantic version for the DevTools runtime, API, and CLI derived from the synced `@devtools/core` manifest.
 */
export const APP_VERSION: string = pkg.version;

/**
 * Standard read-only or mutable environment variable dictionary used across
 * configuration seams to avoid reading `process.env` directly in domain logic.
 */
export type EnvMap = Record<string, string | undefined>;

/**
 * Zod schema validating runtime binding and static asset serving configuration
 * for the loopback daemon and standalone HTTP server.
 *
 * @remarks
 * Rejects unrecognized keys via `.strict()` and defaults to loopback (`127.0.0.1:4000`).
 * Port `0` is explicitly permitted to request an OS-assigned ephemeral port during testing.
 */
export const RuntimeConfigSchema = z
  .object({
    /**
     * Loopback or network hostname to bind the HTTP listener to.
     * @defaultValue "127.0.0.1"
     */
    host: z.string().trim().min(1).default("127.0.0.1"),
    /**
     * TCP port number between 0 (ephemeral) and 65535.
     * @defaultValue 4000
     */
    port: z.number().int().min(0).max(65535).default(4000),
    /**
     * Optional filesystem path to the pre-rendered frontend static export directory.
     */
    staticDir: z.string().trim().min(1).optional(),
  })
  .strict();

/**
 * Validated runtime configuration inferred from {@link RuntimeConfigSchema}.
 */
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

/**
 * Typed error raised when shared runtime configuration (`HOST`, `PORT`, or explicit overrides)
 * fails {@link RuntimeConfigSchema} validation.
 */
export class RuntimeConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RuntimeConfigError";
  }
}

/**
 * Source context describing where runtime configuration values originated for
 * formatting actionable {@link RuntimeConfigError} diagnostics.
 */
export interface RuntimeConfigErrorContext {
  /** Explicit port number passed programmatically or via CLI flags. */
  portOverride?: number;
  /** Raw `PORT` environment variable string. */
  envPort?: string;
  /** Explicit host string passed programmatically or via CLI flags. */
  hostOverride?: string;
  /** Raw `HOST` environment variable string. */
  envHost?: string;
  /** Human-facing label for explicit host overrides (e.g. `"--host"` or `"host"`). */
  hostOptionLabel?: string;
  /** Fallback diagnostic message when an issue does not match `port` or `host`. */
  fallbackMessage?: string;
}

/**
 * Formats a Zod validation error from {@link RuntimeConfigSchema} into an actionable
 * {@link RuntimeConfigError} naming the offending flag or environment variable.
 *
 * @param error - Zod validation error emitted by {@link RuntimeConfigSchema}.
 * @param context - Source metadata distinguishing CLI/programmatic overrides from `PORT`/`HOST` env vars.
 * @returns Actionable {@link RuntimeConfigError} preserving the original error as `cause`.
 */
export function formatRuntimeConfigError(
  error: z.ZodError,
  context: RuntimeConfigErrorContext = {},
): RuntimeConfigError {
  const portIssue = error.issues.find((issue) => issue.path.includes("port"));
  if (portIssue) {
    const label =
      context.portOverride !== undefined
        ? `port number "${context.portOverride}"`
        : `environment variable PORT="${String(context.envPort)}"`;
    return new RuntimeConfigError(
      `Invalid ${label}: must be an integer between 0 and 65535`,
      { cause: error },
    );
  }

  const hostIssue = error.issues.find((issue) => issue.path.includes("host"));
  if (hostIssue) {
    const hostLabel =
      context.hostOverride !== undefined
        ? `${context.hostOptionLabel ?? "host"} "${context.hostOverride}"`
        : `environment variable HOST="${String(context.envHost)}"`;
    return new RuntimeConfigError(
      `Invalid ${hostLabel}: must be a non-empty hostname or IP address`,
      { cause: error },
    );
  }

  const firstIssue = error.issues[0];
  return new RuntimeConfigError(
    firstIssue?.message ??
      context.fallbackMessage ??
      "Invalid runtime configuration",
    { cause: error },
  );
}

/**
 * Resolves a TCP port number from a raw environment string.
 *
 * @remarks
 * Strips leading/trailing whitespace and checks for integer digit sequences.
 * Returns `NaN` for non-integer or malformed strings so callers can delegate validation
 * to {@link RuntimeConfigSchema}. Returns `undefined` if `portStr` is undefined.
 *
 * @param portStr - Raw port string from environment variables (e.g., `process.env.PORT`).
 * @returns Parsed integer port number, `NaN` if string is non-numeric, or `undefined` if `portStr` is undefined.
 */
export function parsePortFromEnv(portStr?: string): number | undefined {
  if (portStr === undefined) {
    return undefined;
  }
  const trimmed = portStr.trim();
  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  return Number.NaN;
}
