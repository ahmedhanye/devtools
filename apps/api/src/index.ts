import {
  API_ERROR_CODES,
  type ApiErrorResponse,
  ApiErrorResponseSchema,
  type HealthResponse,
  HealthResponseSchema,
} from "@devtools/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import pkg from "../package.json" with { type: "json" };

const APP_VERSION =
  typeof pkg.version === "string" && pkg.version ? pkg.version : "0.1.0";

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

function formatError(code: string, message: string): ApiErrorResponse {
  return ApiErrorResponseSchema.parse({
    error: {
      code,
      message,
    },
  });
}

export interface CreateAppOptions {
  basePath?: string;
}

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

  return api.get("/health", (c) => {
    const payload: HealthResponse = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: APP_VERSION,
    };
    return c.json(HealthResponseSchema.parse(payload), 200);
  });
}

export const app = createApp();
export type AppType = typeof app;
export type App = typeof app;
