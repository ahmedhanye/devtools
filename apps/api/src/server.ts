import {
  type EnvMap,
  RuntimeConfigSchema,
  parsePortFromEnv,
} from "@devtools/core";
import type { Server } from "bun";
import type { Hono } from "hono";
import { createApp } from "./index";

/**
 * Options for configuring and booting the standalone `@devtools/api` HTTP server.
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
  app?: Hono;
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
 * Boots the standalone Bun HTTP server hosting the `@devtools/api` Hono application.
 *
 * @param options - Optional port, host, and environment seam overrides.
 * @returns Active {@link ServerInstance} handle.
 */
export function startServer(options: StartServerOptions = {}): ServerInstance {
  const config = resolveServerConfig(options);
  const activeApp = options.app ?? createApp();

  const server = Bun.serve({
    fetch: activeApp.fetch,
    port: config.port,
    hostname: config.host,
  });

  const stop = () => {
    server.stop(true);
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
    if (
      err &&
      typeof err === "object" &&
      "issues" in err &&
      Array.isArray((err as { issues: unknown }).issues)
    ) {
      const messages = (err as { issues: Array<{ message?: string }> }).issues
        .map((i) => i.message)
        .filter(Boolean)
        .join(", ");
      error(`Invalid server configuration: ${messages}`);
    } else if (
      err &&
      typeof err === "object" &&
      (("code" in err && (err as { code?: string }).code === "EADDRINUSE") ||
        ("message" in err &&
          String((err as { message?: string }).message).includes("in use")))
    ) {
      error(
        `Port ${config?.port ?? "unknown"} is already in use. Set PORT=<port> to use an alternate port.`,
      );
    } else {
      error("Failed to start server:", err);
    }
    exit(1);
    return undefined;
  }
}

if (import.meta.main) runServerCli();
