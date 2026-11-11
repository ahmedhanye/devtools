import {
  type EnvMap,
  RuntimeConfigSchema,
  parsePortFromEnv,
} from "@devtools/core";
import {
  closeDb,
  type DevtoolsDb,
  getDb,
  resolveDatabasePath,
  runMigrations,
} from "@devtools/db";
import type { Server } from "bun";
import type { Hono } from "hono";
import { createApp } from "./app";
import type { LighthouseAuditRunner } from "./lighthouse/worker-runner";
import type { ApiBindings } from "./middleware/security";

/**
 * Options for configuring and booting the unified `@devtools/api` HTTP server.
 */
export interface StartServerOptions {
  /** TCP port number (`0` for ephemeral OS-assigned port, `1–65535` for explicit port). */
  port?: number;
  /** Loopback or network hostname to bind. */
  host?: string;
  /** Alias for `host` supported for `Bun.serve` compatibility. */
  hostname?: string;
  /** Optional environment variable map overriding `process.env`. */
  env?: EnvMap;
  /**
   * Optional pre-configured Hono application instance.
   * Defaults to creating an isolated instance via {@link createApp}.
   */
  app?: Hono | Hono<{ Bindings: ApiBindings }> | ReturnType<typeof createApp>;
  /** Optional pre-opened SQLite client overriding singleton `getDb` initialization. */
  db?: DevtoolsDb;
  /** Optional explicit Lighthouse artifacts root directory override. */
  artifactsDir?: string;
  /** Optional audit runner seam passed through to {@link createApp}. */
  auditRunner?: LighthouseAuditRunner;
  /**
   * Optional non-`/api` fallback request handler (used by the CLI loopback daemon to serve
   * pre-rendered frontend static assets on the same port).
   */
  fallbackFetch?: (
    req: Request,
    server: Server<unknown>,
  ) => Response | Promise<Response>;
  /** Optional callback invoked with the resolved SQLite path after startup migrations succeed. */
  onDbInitialized?: (dbPath: string) => void;
}

/**
 * Active standalone HTTP server handle returned by {@link startServer}.
 */
export interface ServerInstance {
  /** Underlying `Bun.serve` server instance. */
  server: Server<unknown>;
  /** Bound TCP port number. */
  port: number;
  /** Stops the HTTP listener and closes active connections. */
  stop: () => Promise<void> | void;
}

/**
 * Resolves and validates standalone API server host and port settings against {@link RuntimeConfigSchema}.
 *
 * @param options - Explicit host/port options and optional `env` seam override.
 * @returns Validated `{ host, port }` configuration.
 * @throws {@link Error} When `port` or `host` fails {@link RuntimeConfigSchema} validation.
 */
export function resolveServerConfig(options: StartServerOptions = {}): {
  host: string;
  port: number;
} {
  const currentEnv = options.env ?? process.env;
  const hostInput = options.host ?? options.hostname ?? currentEnv.HOST;

  const rawPort = options.port ?? parsePortFromEnv(currentEnv.PORT);

  const validated = RuntimeConfigSchema.parse({
    ...(rawPort !== undefined ? { port: rawPort } : {}),
    ...(hostInput !== undefined ? { host: hostInput } : {}),
  });

  return {
    host: validated.host,
    port: validated.port,
  };
}

/**
 * Boots the unified Bun HTTP server hosting the `@devtools/api` Hono application,
 * initializing SQLite persistence migrations and forwarding `{ server }` bindings for
 * socket peer verification and SSE timeout control.
 *
 * @param options - Optional port, host, database, fallback static handler, and test seams.
 * @returns Active {@link ServerInstance} handle.
 * @throws {@link Error} When database migrations fail or port binding fails.
 */
export function startServer(options: StartServerOptions = {}): ServerInstance {
  const config = resolveServerConfig(options);

  let activeDb = options.db;
  let ownsDb = false;
  if (!activeDb) {
    const dbPath = resolveDatabasePath({ env: options.env });
    try {
      activeDb = getDb({ path: dbPath, env: options.env });
      ownsDb = true;
      runMigrations(activeDb);
    } catch (error) {
      closeDb();
      throw new Error(
        `Fatal: failed to initialize persistence database: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    options.onDbInitialized?.(dbPath);
  }

  const activeApp =
    options.app ??
    createApp({
      basePath: "/api",
      db: activeDb,
      env: options.env,
      artifactsDir: options.artifactsDir,
      auditRunner: options.auditRunner,
    });

  let server: Server<unknown>;
  try {
    server = Bun.serve({
      port: config.port,
      hostname: config.host,
      fetch(req, bunServer) {
        if (options.fallbackFetch) {
          const url = new URL(req.url);
          if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) {
            return options.fallbackFetch(req, bunServer);
          }
        }
        return activeApp.fetch(req, { server: bunServer });
      },
    });
  } catch (error) {
    if (ownsDb) {
      closeDb();
    }
    throw error;
  }

  const stop = () => {
    server.stop(true);
    if (ownsDb) {
      closeDb();
    }
  };

  return {
    server,
    port: server.port ?? config.port,
    stop,
  };
}

/**
 * Dependency injection seams for testing standalone API server startup in {@link runServerCli}.
 */
export interface ServerCliDeps {
  /** Override server configuration resolution. */
  resolveConfig?: () => { host: string; port: number };
  /** Override server booting. */
  start?: (options?: StartServerOptions) => ServerInstance;
  /** Override stdout logger. */
  log?: (message: string) => void;
  /** Override stderr logger. */
  error?: (message: string, ...rest: unknown[]) => void;
  /** Override process exit handler. */
  exit?: (code?: number) => void;
  /** Override signal listener registration. */
  onSignal?: (event: "SIGINT" | "SIGTERM", handler: () => void) => void;
}

interface StartupErrorShape {
  issues?: Array<{ message?: string }>;
  code?: string;
  message?: unknown;
}

function formatConfigValidationError(record: StartupErrorShape): string | null {
  if (!Array.isArray(record.issues)) {
    return null;
  }
  const messages = record.issues
    .map((i) => i.message)
    .filter(Boolean)
    .join(", ");
  return `Invalid server configuration: ${messages}`;
}

function formatServerStartupError(
  err: unknown,
  port?: number,
): { message: string; raw?: unknown } {
  const record =
    err && typeof err === "object" ? (err as StartupErrorShape) : {};
  const configError = formatConfigValidationError(record);
  if (configError) {
    return { message: configError };
  }
  if (
    record.code === "EADDRINUSE" ||
    String(record.message ?? "").includes("in use")
  ) {
    return {
      message: `Port ${port ?? "unknown"} is already in use. Set PORT=<port> to use an alternate port.`,
    };
  }
  return { message: "Failed to start server:", raw: err };
}

/**
 * Boots the standalone HTTP server application using environment configuration and registers process signal handlers.
 *
 * @param deps - Optional dependency injection seams for hermetic in-process testing.
 * @returns Active {@link ServerInstance} handle or `undefined` if startup failed.
 */
export function runServerCli(deps?: ServerCliDeps): ServerInstance | undefined {
  const resolveConfig = deps?.resolveConfig ?? resolveServerConfig;
  const start = deps?.start ?? startServer;
  const log = deps?.log ?? console.log;
  const error = deps?.error ?? console.error;
  const exit = deps?.exit ?? process.exit;
  const onSignal =
    deps?.onSignal ??
    ((event, handler) => {
      process.on(event, handler);
    });

  let config: { host: string; port: number } | undefined;
  try {
    config = resolveConfig();
    const instance = start(config);
    log(
      `Server listening on http://${instance.server.hostname}:${instance.port}`,
    );

    const shutdown = () => {
      log("Shutting down server...");
      instance.stop();
      exit(0);
    };

    onSignal("SIGINT", shutdown);
    onSignal("SIGTERM", shutdown);

    return instance;
  } catch (err: unknown) {
    const formatted = formatServerStartupError(err, config?.port);
    if ("raw" in formatted) {
      error(formatted.message, formatted.raw);
    } else {
      error(formatted.message);
    }
    exit(1);
    return undefined;
  }
}

if (import.meta.main) runServerCli();
