import { API_ERROR_CODES, type EnvMap } from "@devtools/core";
import type { ShutdownRegistry } from "@devtools/core/node";
import type { LighthouseStore } from "@devtools/lighthouse";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createHealthRoutes } from "../modules/health";
import {
  createLighthouseRoutes,
  type LighthouseAuditRunner,
} from "../modules/lighthouse";
import { jsonApiError } from "../shared/http";
import {
  type ApiBindings,
  createLoopbackProtectionMiddleware,
  isLoopbackOrigin,
} from "../shared/security";

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
  /** Optional injected {@link LighthouseStore} instance (defaults lazily to `openLighthouseStore(...)`). */
  store?: LighthouseStore;
  /** Optional shutdown registry for Phase 3 (`"persistence"`) cleanup hook registration. */
  shutdown?: ShutdownRegistry;
  /** Optional environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Optional explicit Lighthouse artifacts root directory override. */
  artifactsDir?: string;
  /** Optional audit batch runner seam overriding `executeLighthouseBatch`. */
  auditRunner?: LighthouseAuditRunner;
  /** Duration in milliseconds to retain the latest terminal Audit Job SSE snapshot. */
  jobRetentionMs?: number;
  /** Interval in milliseconds for SSE `: keepalive\n\n` heartbeats. */
  keepaliveIntervalMs?: number;
}

function mountDefaultApiRoutes(
  baseApp: Hono<{ Bindings: ApiBindings }>,
  lighthouseRoutes: ReturnType<typeof createLighthouseRoutes>,
) {
  return baseApp
    .basePath("/api")
    .route("/", createHealthRoutes())
    .route("/lighthouse", lighthouseRoutes);
}

export type DefaultMountedApp = ReturnType<typeof mountDefaultApiRoutes>;

/**
 * Creates a configured Hono application instance with loopback CORS, CSRF protection,
 * structured JSON error boundaries, API route modules, and a cooperative `shutdown()` hook.
 *
 * @param options - Optional route mounting prefix and test injection seams.
 * @returns Chained Hono application instance with `shutdown()` while preserving {@link AppType} RPC inference.
 */
export function createApp(options: CreateAppOptions = {}) {
  const rawBasePath = options.basePath ?? "/api";
  let basePathEnd = rawBasePath.length;
  while (basePathEnd > 0 && rawBasePath.charCodeAt(basePathEnd - 1) === 47) {
    basePathEnd -= 1;
  }
  const basePath = rawBasePath.slice(0, basePathEnd);
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
    return jsonApiError(
      c,
      404,
      API_ERROR_CODES.NOT_FOUND,
      `Route not found: ${c.req.method} ${c.req.path}`,
    );
  });

  app.onError((err, c) => {
    const message =
      err instanceof Error ? err.message : "Internal Server Error";
    return jsonApiError(c, 500, API_ERROR_CODES.INTERNAL_ERROR, message);
  });

  const lighthouseRoutes = createLighthouseRoutes({
    store: options.store,
    shutdown: options.shutdown,
    env: options.env,
    artifactsDir: options.artifactsDir,
    auditRunner: options.auditRunner,
    jobRetentionMs: options.jobRetentionMs,
    keepaliveIntervalMs: options.keepaliveIntervalMs,
  });

  const mounted =
    basePath === "/api"
      ? mountDefaultApiRoutes(app, lighthouseRoutes)
      : (app
          .basePath(basePath)
          .route("/", createHealthRoutes())
          .route("/lighthouse", lighthouseRoutes) as DefaultMountedApp);

  return Object.assign(mounted, {
    shutdown: () => lighthouseRoutes.shutdown(),
  });
}

/**
 * Inferred Hono RPC router type for end-to-end typed client consumption (`hc<AppType>`).
 */
export type AppType = DefaultMountedApp;
