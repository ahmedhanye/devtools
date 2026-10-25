import { existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createApp } from "@devtools/api";
import { type EnvMap, RuntimeConfigSchema } from "@devtools/core";
import { closeDb, db, resolveDatabasePath, runMigrations } from "@devtools/db";
import type { Server } from "bun";
import pc from "picocolors";

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
  /** Optional environment variable map overriding `process.env`. */
  env?: EnvMap;
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
  /** Stops the HTTP server and cleanly closes the SQLite persistence handle. */
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
): string {
  const explicit = customPath ?? env.DEVTOOLS_STATIC_DIR;
  if (explicit) {
    return resolve(process.cwd(), explicit);
  }

  const candidates = [
    resolve(import.meta.dir, "../static"),
    resolve(import.meta.dir, "../../frontend/dist"),
    resolve(import.meta.dir, "../../../apps/frontend/dist"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return resolve(import.meta.dir, "../../frontend/dist");
}

/**
 * Resolves and validates daemon host, port, and static asset directory configuration
 * against {@link RuntimeConfigSchema}.
 *
 * @param options - Explicit daemon options and optional `env` seam override.
 * @returns Validated `{ host, port, staticDir }` configuration.
 * @throws {Error} When `port` or `host` fails {@link RuntimeConfigSchema} validation.
 */
export function resolveDaemonConfig(options: StartDaemonOptions = {}): {
  host: string;
  port: number;
  staticDir?: string;
} {
  const currentEnv = options.env ?? process.env;
  const rawPort =
    options.port !== undefined
      ? options.port
      : currentEnv.PORT !== undefined
        ? Number.parseInt(currentEnv.PORT, 10)
        : undefined;
  const rawHost = options.host ?? currentEnv.HOST;
  const rawStaticDir = options.staticDir ?? currentEnv.DEVTOOLS_STATIC_DIR;

  const validated = RuntimeConfigSchema.parse({
    ...(rawPort !== undefined ? { port: rawPort } : {}),
    ...(rawHost !== undefined ? { host: rawHost } : {}),
    ...(rawStaticDir !== undefined ? { staticDir: rawStaticDir } : {}),
  });

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
  const decodedPath = decodeURIComponent(urlPath);
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
 * Starts the unified single-process loopback daemon co-locating SQLite migrations,
 * in-process `@devtools/api` routing (`/api/*`), and frontend static asset serving (`/*`).
 *
 * @param options - Optional port, host, static directory, and environment overrides.
 * @returns Running {@link DaemonInstance} handle.
 * @throws {Error} When the static asset directory does not exist or SQLite migrations fail.
 */
export function startDaemon(options: StartDaemonOptions = {}): DaemonInstance {
  const config = resolveDaemonConfig(options);
  const staticDir = resolveStaticDir(config.staticDir, options.env);

  if (!existsSync(staticDir)) {
    throw new Error(
      `Static assets directory not found at "${staticDir}". Run "bun run build" in @devtools/frontend to generate static assets, or pass --static-dir <path>.`,
    );
  }

  try {
    runMigrations(db);
  } catch (error) {
    throw new Error(
      `Fatal: failed to initialize persistence database: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  console.error(
    pc.dim(`Persistence initialized: SQLite (${resolveDatabasePath()})`),
  );

  const api = createApp({ basePath: "/api" });

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return api.fetch(req);
      }
      return serveStaticAsset(staticDir, url.pathname, req.method);
    },
  });

  const stop = () => {
    server.stop(true);
    closeDb();
  };

  return {
    server,
    port: server.port ?? config.port,
    hostname: server.hostname ?? config.host,
    staticDir,
    stop,
  };
}
