import { type EnvMap, RuntimeConfigSchema } from "@devtools/core";
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
 * @throws {Error} When `port` or `host` fails {@link RuntimeConfigSchema} validation.
 */
export function resolveServerConfig(options: StartServerOptions = {}): {
  host: string;
  port: number;
} {
  const currentEnv = options.env ?? process.env;
  const hostInput = options.host ?? options.hostname ?? currentEnv.HOST;

  const rawPort =
    options.port ??
    (currentEnv.PORT ? Number.parseInt(currentEnv.PORT, 10) : undefined);

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

if (import.meta.main) {
  const config = resolveServerConfig();
  try {
    const instance = startServer(config);
    console.log(
      `Server listening on http://${instance.server.hostname}:${instance.port}`,
    );

    const shutdown = () => {
      console.log("Shutting down server...");
      instance.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      (("code" in err && (err as { code?: string }).code === "EADDRINUSE") ||
        ("message" in err &&
          String((err as { message?: string }).message).includes("in use")))
    ) {
      console.error(
        `Port ${config.port} is already in use. Set PORT=<port> to use an alternate port.`,
      );
    } else {
      console.error("Failed to start server:", err);
    }
    process.exit(1);
  }
}
