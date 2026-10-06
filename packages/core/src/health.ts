import { z } from "zod";

export const HealthStatusSchema = z.enum(["ok", "degraded", "error"]);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthResponseSchema = z
  .object({
    status: HealthStatusSchema,
    timestamp: z.string().datetime(),
    uptime: z.number().nonnegative(),
    version: z.string().min(1),
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
