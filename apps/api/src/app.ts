import { API_ERROR_CODES, type EnvMap } from "@devtools/core";
import type { DevtoolsDb } from "@devtools/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { LighthouseAuditRunner } from "./lighthouse/worker-runner";
import {
  type ApiBindings,
  createLoopbackProtectionMiddleware,
  formatError,
  isLoopbackOrigin,
} from "./middleware/security";
import { createHealthRoutes } from "./routes/health";
import { createLighthouseRoutes } from "./routes/lighthouse";

/**
 * Configuration options for instantiating the Hono API application via {@link createApp}.
 */
export interface CreateAppOptions {
  /**
   * URL prefix under which all API routes are mounted.
   * Pass `""` to mount routes at the root path `/`.
   * @defaultValue "/api"
   */
  basePath?: string;
  /** Optional injected `@devtools/db` instance (defaults lazily to `getDb({ env })`). */
  db?: DevtoolsDb;
  /** Optional environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Optional explicit Lighthouse artifacts root directory override. */
  artifactsDir?: string;
  /** Optional audit batch runner seam overriding the production Bun `Worker`. */
  auditRunner?: LighthouseAuditRunner;
  /** Duration in milliseconds to retain the latest terminal Audit Job SSE snapshot. */
  jobRetentionMs?: number;
  /** Interval in milliseconds for SSE `: keepalive\n\n` heartbeats. */
  keepaliveIntervalMs?: number;
}

/**
 * Creates a configured Hono application instance with loopback CORS, CSRF protection,
 * structured JSON error boundaries, and API route modules.
 *
 * @param options - Optional route mounting prefix and test injection seams.
 * @returns Chained Hono application instance preserving full route type inference (`AppType`).
 */
export function createApp(options: CreateAppOptions = {}) {
  const basePath = options.basePath ?? "/api";
  const app = new Hono<{ Bindings: ApiBindings }>();

  const corsPath = basePath ? `${basePath}/*` : "/*";
  app.use(
    corsPath,
    cors({
      origin: (origin) => {
        if (origin && isLoopbackOrigin(origin)) {
          return origin;
        }
        return null;
      },
      allowMethods: [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "PATCH",
        "OPTIONS",
        "HEAD",
      ],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.use(corsPath, createLoopbackProtectionMiddleware());

  app.notFound((c) => {
    return c.json(
      formatError(
        API_ERROR_CODES.NOT_FOUND,
        `Route not found: ${c.req.method} ${c.req.path}`,
      ),
      404,
    );
  });

  app.onError((err, c) => {
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    return c.json(formatError(API_ERROR_CODES.INTERNAL_ERROR, message), 500);
  });

  const api = basePath ? app.basePath(basePath) : app;

  return api.route("/", createHealthRoutes()).route(
    "/lighthouse",
    createLighthouseRoutes({
      db: options.db,
      env: options.env,
      artifactsDir: options.artifactsDir,
      auditRunner: options.auditRunner,
      jobRetentionMs: options.jobRetentionMs,
      keepaliveIntervalMs: options.keepaliveIntervalMs,
    }),
  );
}

/**
 * Default Hono API application instance mounted at `/api`.
 */
export const app = createApp();

/**
 * Inferred Hono RPC router type for end-to-end typed client consumption (`hc<AppType>`).
 */
export type AppType = typeof app;

/**
 * Alias for {@link AppType}.
 */
export type App = typeof app;
