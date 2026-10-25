import { z } from "zod";

/**
 * Zod enum representing the operational health state of the DevTools daemon.
 *
 * - `"ok"`: All subsystems are healthy and serving traffic normally.
 * - `"degraded"`: Core HTTP serving is active, but an auxiliary subsystem is impaired.
 * - `"error"`: The service is unhealthy and unable to fulfill core requests.
 */
export const HealthStatusSchema = z.enum(["ok", "degraded", "error"]);

/**
 * Operational health state literal inferred from {@link HealthStatusSchema}.
 */
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/**
 * Zod schema validating the `/api/health` readiness and liveness response payload.
 *
 * @remarks
 * Used by both `@devtools/api` on response serialization and `@devtools/cli` /
 * E2E probes to verify daemon readiness.
 */
export const HealthResponseSchema = z
  .object({
    /** Overall operational status of the daemon. */
    status: HealthStatusSchema,
    /** ISO-8601 UTC timestamp when the health check was generated. */
    timestamp: z.string().datetime(),
    /** Process uptime in seconds (non-negative float). */
    uptime: z.number().nonnegative(),
    /** Semantic version string of the running DevTools instance. */
    version: z.string().min(1),
  })
  .strict();

/**
 * Validated health check response payload inferred from {@link HealthResponseSchema}.
 */
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
