import { z } from "zod";

/**
 * Canonical semantic version for the DevTools runtime, API, and CLI.
 */
export const APP_VERSION = "0.1.0";

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
    host: z.string().min(1).default("127.0.0.1"),
    /**
     * TCP port number between 0 (ephemeral) and 65535.
     * @defaultValue 4000
     */
    port: z.number().int().min(0).max(65535).default(4000),
    /**
     * Optional filesystem path to the pre-rendered frontend static export directory.
     */
    staticDir: z.string().optional(),
  })
  .strict();

/**
 * Validated runtime configuration inferred from {@link RuntimeConfigSchema}.
 */
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
