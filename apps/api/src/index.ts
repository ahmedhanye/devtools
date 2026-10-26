import { API_ERROR_CODES } from "@devtools/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createLoopbackProtectionMiddleware,
  formatError,
  isLoopbackOrigin,
} from "./middleware/security";
import { createHealthRoutes } from "./routes/health";

export {
  createLoopbackProtectionMiddleware,
  formatError,
  isLoopbackOrigin,
} from "./middleware/security";
export { createHealthRoutes } from "./routes/health";

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
}

/**
 * Creates a configured Hono application instance with loopback CORS, CSRF protection,
 * structured JSON error boundaries, and API route modules.
 *
 * @param options - Optional route mounting prefix configuration.
 * @returns Chained Hono application instance preserving full route type inference (`AppType`).
 */
export function createApp(options: CreateAppOptions = {}) {
  const basePath = options.basePath ?? "/api";
  const app = new Hono();

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

  return api.route("/", createHealthRoutes());
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
