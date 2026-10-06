import { RuntimeConfigSchema } from "@devtools/core";
import type { Server } from "bun";
import { app } from "./index";

export interface StartServerOptions {
  port?: number;
  host?: string;
  hostname?: string;
}

export interface ServerInstance {
  server: Server<unknown>;
  port: number;
  stop: () => Promise<void> | void;
}

export function resolveServerConfig(options: StartServerOptions = {}): {
  host: string;
  port: number;
} {
  const hostInput = options.host ?? options.hostname ?? process.env.HOST;

  const rawPort =
    options.port ??
    (process.env.PORT ? Number.parseInt(process.env.PORT, 10) : undefined);

  const validated = RuntimeConfigSchema.parse({
    ...(rawPort !== undefined ? { port: rawPort } : {}),
    ...(hostInput !== undefined ? { host: hostInput } : {}),
  });

  return {
    host: validated.host,
    port: validated.port,
  };
}

export function startServer(options: StartServerOptions = {}): ServerInstance {
  const config = resolveServerConfig(options);

  const server = Bun.serve({
    fetch: app.fetch,
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
