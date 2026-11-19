import {
  type EnvMap,
  RuntimeConfigError,
  RuntimeConfigSchema,
  formatRuntimeConfigError,
  parsePortFromEnv,
} from "@devtools/core";
import {
  attachHostSignals,
  createConsoleOutput,
  createShutdownCoordinator,
  type ExitPort,
  type OutputPort,
  type ShutdownCoordinator,
  type SignalSourcePort,
} from "@devtools/core/node";
import type { LighthouseStore } from "@devtools/lighthouse";
import type { Server } from "bun";
import type { Hono } from "hono";
import type { LighthouseAuditRunner } from "../modules/lighthouse";
import type { ApiBindings } from "../shared/security";
import { createApp } from "./create-app";

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
  app?: Hono | Hono<{ Bindings: ApiBindings }> | ReturnType<typeof createApp>;
  /** Optional injected {@link LighthouseStore} forwarded to {@link createApp}. */
  store?: LighthouseStore;
  /** Optional shared 3-phase {@link ShutdownCoordinator} orchestrating server shutdown. */
  shutdown?: ShutdownCoordinator;
  /** Optional explicit Lighthouse artifacts root directory override. */
  artifactsDir?: string;
  /** Optional audit runner seam passed through to {@link createApp}. */
  auditRunner?: LighthouseAuditRunner;
}

/**
 * Active standalone HTTP server handle returned by {@link startServer}.
 */
export interface ServerInstance {
  /** Underlying `Bun.serve` server instance. */
  server: Server<unknown>;
  /** Bound TCP port number. */
  port: number;
  /** Stops the HTTP listener and cancels any active audit jobs before resolving. */
  stop: () => Promise<void> | void;
}

/**
 * Resolves and validates standalone API server host and port settings against {@link RuntimeConfigSchema}.
 *
 * @param options - Explicit host/port options and optional `env` seam override.
 * @returns Validated `{ host, port }` configuration.
 * @throws {@link RuntimeConfigError} When `port` or `host` fails {@link RuntimeConfigSchema} validation.
 */
export function resolveServerConfig(options: StartServerOptions = {}): {
  host: string;
  port: number;
} {
  const currentEnv = options.env ?? process.env;
  const explicitHost = options.host ?? options.hostname;
  const hostInput = explicitHost ?? currentEnv.HOST;
  const rawPort = options.port ?? parsePortFromEnv(currentEnv.PORT);

  const result = RuntimeConfigSchema.safeParse({
    ...(rawPort !== undefined ? { port: rawPort } : {}),
    ...(hostInput !== undefined ? { host: hostInput } : {}),
  });

  if (!result.success) {
    throw formatRuntimeConfigError(result.error, {
      portOverride: options.port,
      envPort: currentEnv.PORT,
      hostOverride: explicitHost,
      envHost: currentEnv.HOST,
      fallbackMessage: "Invalid server configuration",
    });
  }

  return {
    host: result.data.host,
    port: result.data.port,
  };
}

/**
 * Boots the standalone Bun HTTP server hosting the `@devtools/api` Hono application
 * and forwards `{ server }` bindings for socket peer verification and SSE timeout control.
 *
 * @param options - Optional port, host, database, and test seams.
 * @returns Active {@link ServerInstance} handle.
 * @throws {@link Error} When configuration validation or port binding fails.
 */
export function startServer(options: StartServerOptions = {}): ServerInstance {
  const config = resolveServerConfig(options);
  const coordinator = options.shutdown ?? createShutdownCoordinator();

  const activeApp =
    options.app ??
    createApp({
      basePath: "/api",
      store: options.store,
      shutdown: coordinator,
      env: options.env,
      artifactsDir: options.artifactsDir,
      auditRunner: options.auditRunner,
    });

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch(req, bunServer) {
      return activeApp.fetch(req, { server: bunServer });
    },
  });

  const disposeIngress = coordinator.register(
    "ingress",
    () => server.stop(true),
    { id: "api-http-ingress" },
  );
  const rawShutdown =
    "shutdown" in activeApp && typeof activeApp.shutdown === "function"
      ? activeApp.shutdown
      : undefined;
  const shutdownApp = rawShutdown
    ? async () => {
        await rawShutdown();
      }
    : undefined;
  const disposeWork = shutdownApp
    ? coordinator.register("work", shutdownApp, {
        id: "api-app-work",
      })
    : undefined;

  const stop = async () => {
    try {
      await coordinator.shutdown("stop");
    } finally {
      disposeIngress();
      disposeWork?.();
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
  /** Override OS signal source port (`process` by default). */
  signals?: SignalSourcePort;
  /** Override stdout/stderr output port (`createConsoleOutput()` by default). */
  output?: OutputPort;
  /** Override process exit handler. */
  exit?: ExitPort;
  /** Override outer CLI shutdown coordinator. */
  shutdown?: ShutdownCoordinator;
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
  if (err instanceof RuntimeConfigError) {
    return { message: `Invalid server configuration: ${err.message}` };
  }
  const record =
    err && typeof err === "object" ? (err as StartupErrorShape) : {};
  const configError = formatConfigValidationError(record);
  if (configError) {
    return { message: configError };
  }
  if (
    record.code === "EADDRINUSE" ||
    (typeof record.message === "string" && record.message.includes("in use"))
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
  const output = deps?.output ?? createConsoleOutput();
  const exit: ExitPort = deps?.exit ?? ((code) => process.exit(code));

  let config: { host: string; port: number } | undefined;
  try {
    config = resolveConfig();
    const instance = start(config);
    output.writeStdout(
      `Server listening on http://${instance.server.hostname}:${instance.port}`,
    );

    const cliCoordinator = deps?.shutdown ?? createShutdownCoordinator();
    cliCoordinator.register(
      "ingress",
      () => {
        output.writeStdout("Shutting down server...");
      },
      { id: "api-cli-banner" },
    );
    cliCoordinator.register("work", () => instance.stop(), {
      id: "api-cli-stop",
    });

    const signalHandle = attachHostSignals({
      coordinator: cliCoordinator,
      signals: deps?.signals,
      output,
      exit,
      exitCodeOnSignal: 0,
      forceExitOnSecondSignal: true,
      formatFirstSignalMessage: () => null,
      formatErrorMessage: (err) =>
        `Failed to shut down server cleanly: ${err instanceof Error ? err.message : String(err)}`,
    });

    return {
      server: instance.server,
      port: instance.port,
      stop: async () => {
        signalHandle.detach();
        await instance.stop();
      },
    };
  } catch (err: unknown) {
    const formatted = formatServerStartupError(err, config?.port);
    if ("raw" in formatted) {
      const detail =
        formatted.raw instanceof Error
          ? formatted.raw.message
          : String(formatted.raw);
      output.writeStderr(`${formatted.message} ${detail}`);
    } else {
      output.writeStderr(formatted.message);
    }
    exit(1);
    return undefined;
  }
}
