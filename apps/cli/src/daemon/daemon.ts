import { existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  bindManagedServer,
  type CreateAppOptions,
  createApp,
} from "@devtools/api";
import {
  type EnvMap,
  RuntimeConfigSchema,
  formatRuntimeConfigError,
  parsePortFromEnv,
} from "@devtools/core";
import { createTeardown } from "@devtools/core/node";
import type { DbSession } from "@devtools/db";
import type { LighthouseStore } from "@devtools/lighthouse/application";
import type { Server } from "bun";

/**
 * Configuration options for starting the unified loopback daemon via {@link startDaemon}.
 */
export interface StartDaemonOptions {
  /** TCP port to bind (`0` for ephemeral port, `1–65535` for explicit port). */
  port?: number;
  /** Loopback or network hostname to bind. */
  host?: string;
  /** Explicit filesystem path to the pre-rendered frontend static asset directory. */
  staticDir?: string;
  /** Optional borrowed SQLite session forwarded to `@devtools/api` when `store` is omitted. */
  db?: DbSession;
  /** Optional injected {@link LighthouseStore} forwarded to `@devtools/api`. */
  store?: LighthouseStore;
  /** Optional cancellation signal linking outer teardown into active audit jobs and 503 guards. */
  signal?: AbortSignal;
  /** Optional environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Optional audit runner seam passed through to {@link createApp}. */
  auditRunner?: CreateAppOptions["auditRunner"];
}

/**
 * Running loopback daemon handle returned by {@link startDaemon}.
 */
export interface DaemonInstance {
  /** Underlying `Bun.serve` HTTP server instance. */
  server: Server<unknown>;
  /** Bound TCP port number. */
  port: number;
  /** Bound interface hostname. */
  hostname: string;
  /** Resolved absolute path to the static asset root directory. */
  staticDir: string;
  /** Stops the HTTP server, drains active jobs, and closes persistence handles cleanly. */
  stop: () => Promise<void> | void;
}

/**
 * Resolves the absolute directory path containing pre-rendered frontend static assets.
 *
 * @param customPath - Optional explicit directory path override.
 * @param env - Optional environment variable map overriding `process.env`.
 * @returns Resolved absolute path to the static asset directory.
 */
export function resolveStaticDir(
  customPath?: string,
  env: EnvMap = process.env,
  exists: (dirPath: string) => boolean = existsSync,
): string {
  const explicit = customPath ?? env.DEVTOOLS_STATIC_DIR;
  if (explicit !== undefined) {
    if (explicit.trim() === "") {
      const source =
        customPath !== undefined
          ? "--static-dir"
          : "environment variable DEVTOOLS_STATIC_DIR";
      throw new Error(`Invalid ${source}: path must not be empty`);
    }
    return resolve(process.cwd(), explicit);
  }

  const cliRoot = resolve(import.meta.dir, "../..");
  const candidates = [
    resolve(cliRoot, "static"),
    resolve(cliRoot, "../frontend/dist"),
    resolve(cliRoot, "../../apps/frontend/dist"),
  ];

  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate;
    }
  }

  return resolve(cliRoot, "../frontend/dist");
}

type ConfigValidationError = Extract<
  ReturnType<typeof RuntimeConfigSchema.safeParse>,
  { success: false }
>["error"];

function formatDaemonValidationError(
  error: ConfigValidationError,
  options: StartDaemonOptions,
  currentEnv: EnvMap,
): Error {
  const staticDirIssue = error.issues.find((issue) =>
    issue.path.includes("staticDir"),
  );
  if (staticDirIssue) {
    const source =
      options.staticDir !== undefined
        ? "--static-dir"
        : "environment variable DEVTOOLS_STATIC_DIR";
    return new Error(`Invalid ${source}: path must not be empty`, {
      cause: error,
    });
  }

  return formatRuntimeConfigError(error, {
    portOverride: options.port,
    envPort: currentEnv.PORT,
    hostOverride: options.host,
    envHost: currentEnv.HOST,
    hostOptionLabel: "--host",
    fallbackMessage: "Invalid daemon configuration",
  });
}

/**
 * Resolves and validates daemon host, port, and static asset directory configuration
 * against {@link RuntimeConfigSchema}.
 *
 * @param options - Explicit daemon options and optional `env` seam override.
 * @returns Validated `{ host, port, staticDir }` configuration.
 * @throws {@link Error} When `port`, `host`, or `staticDir` fails {@link RuntimeConfigSchema} validation.
 */
export function resolveDaemonConfig(options: StartDaemonOptions = {}): {
  host: string;
  port: number;
  staticDir?: string;
} {
  const currentEnv = options.env ?? process.env;
  const rawPort = options.port ?? parsePortFromEnv(currentEnv.PORT);
  const rawHost = options.host ?? currentEnv.HOST;
  const rawStaticDir = options.staticDir ?? currentEnv.DEVTOOLS_STATIC_DIR;

  const result = RuntimeConfigSchema.safeParse({
    ...(rawPort !== undefined ? { port: rawPort } : {}),
    ...(rawHost !== undefined ? { host: rawHost } : {}),
    ...(rawStaticDir !== undefined ? { staticDir: rawStaticDir } : {}),
  });

  if (!result.success) {
    throw formatDaemonValidationError(result.error, options, currentEnv);
  }

  const validated = result.data;

  return {
    host: validated.host,
    port: validated.port,
    staticDir: validated.staticDir,
  };
}

/**
 * Attempts to serve a regular file from disk with its inferred MIME type.
 */
function tryServeFile(filePath: string, status = 200): Response | null {
  try {
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const file = Bun.file(filePath);
      return new Response(file, {
        status,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });
    }
  } catch {
    // Ignore filesystem errors
  }
  return null;
}

/**
 * Resolves the Ordered Candidate file paths for a clean static URL path.
 */
function buildStaticCandidatePaths(
  baseDir: string,
  decodedPath: string,
  safePath: string,
): string[] {
  if (decodedPath === "/" || decodedPath === "") {
    return [join(baseDir, "index.html")];
  }
  return [safePath, `${safePath}.html`, join(safePath, "index.html")];
}

/**
 * Serves a static asset from `staticDir` with strict path traversal protection
 * and Next.js static export clean-path resolution (`<path>`, `<path>.html`, `<path>/index.html`, `404.html`).
 *
 * @param staticDir - Absolute or relative root directory containing static assets.
 * @param urlPath - Raw URL pathname from the incoming HTTP request.
 * @param method - HTTP request method (`"GET"` or `"HEAD"`). Defaults to `"GET"`.
 * @returns HTTP `Response` containing the matched asset, `403 Forbidden`, `404 Not Found`, or `405 Method Not Allowed`.
 */
export async function serveStaticAsset(
  staticDir: string,
  urlPath: string,
  method: string = "GET",
): Promise<Response> {
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const baseDir = resolve(staticDir);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  const safePath = resolve(baseDir, "." + decodedPath);

  if (safePath !== baseDir && !safePath.startsWith(baseDir + sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  for (const candidate of buildStaticCandidatePaths(
    baseDir,
    decodedPath,
    safePath,
  )) {
    const res = tryServeFile(candidate);
    if (res) return res;
  }

  const notFoundRes = tryServeFile(join(baseDir, "404.html"), 404);
  if (notFoundRes) return notFoundRes;

  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Starts the unified single-process loopback daemon co-locating lazy SQLite persistence,
 * in-process `@devtools/api` routing (`/api/*`), and frontend static asset serving (`/*`).
 *
 * @param options - Optional port, host, static directory, store, shutdown, env, and audit runner overrides.
 * @returns Running {@link DaemonInstance} handle.
 * @throws {@link Error} When configuration validation fails or the static asset directory is missing.
 */
export function startDaemon(options: StartDaemonOptions = {}): DaemonInstance {
  const config = resolveDaemonConfig(options);
  const staticDir = resolveStaticDir(config.staticDir, options.env);

  if (!existsSync(staticDir)) {
    throw new Error(
      `Static assets directory not found at "${staticDir}". Run "bun run build" in @devtools/frontend to generate static assets, or pass --static-dir <path>.`,
    );
  }

  const teardown = createTeardown();
  const routeSignal = options.signal
    ? AbortSignal.any([options.signal, teardown.signal])
    : teardown.signal;

  const api = createApp({
    basePath: "/api",
    db: options.db,
    store: options.store,
    signal: routeSignal,
    env: options.env,
    auditRunner: options.auditRunner,
  });
  teardown.defer(() => api.shutdown());

  const handleRequest = (req: Request, bunServer: Server<unknown>) => {
    const { pathname } = new URL(req.url);
    return pathname === "/api" || pathname.startsWith("/api/")
      ? api.fetch(req, { server: bunServer })
      : serveStaticAsset(staticDir, pathname, req.method);
  };

  const server = bindManagedServer({
    port: config.port,
    hostname: config.host,
    teardown,
    fetch: handleRequest,
  });

  return {
    server,
    port: server.port ?? config.port,
    hostname: server.hostname ?? config.host,
    staticDir,
    stop: () => teardown.run(),
  };
}
