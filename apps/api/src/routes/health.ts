import {
  APP_VERSION,
  type HealthResponse,
  HealthResponseSchema,
} from "@devtools/core";
import { Hono } from "hono";

/**
 * Creates the `/health` route module reporting liveness, uptime, and runtime version.
 *
 * @returns Hono router with `GET /health` registered and typed for RPC inference.
 */
export function createHealthRoutes() {
  return new Hono().get("/health", (c) => {
    const payload: HealthResponse = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: APP_VERSION,
    };
    return c.json(HealthResponseSchema.parse(payload), 200);
  });
}
