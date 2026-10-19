import { existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createApp } from "@devtools/api";
import { RuntimeConfigSchema } from "@devtools/core";
import { db, resolveDatabasePath, runMigrations } from "@devtools/db";
import type { Server } from "bun";
import pc from "picocolors";

export interface StartDaemonOptions {
  port?: number;
  host?: string;
  staticDir?: string;
}

export interface DaemonInstance {
  server: Server<unknown>;
  port: number;
  hostname: string;
  staticDir: string;
  stop: () => Promise<void> | void;
}

export function resolveStaticDir(customPath?: string): string {
  const explicit = customPath ?? process.env.DEVTOOLS_STATIC_DIR;
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

export function resolveDaemonConfig(options: StartDaemonOptions = {}): {
  host: string;
  port: number;
  staticDir?: string;
} {
  const rawPort =
    options.port !== undefined
      ? options.port
      : process.env.PORT !== undefined
        ? Number.parseInt(process.env.PORT, 10)
        : undefined;
  const rawHost = options.host ?? process.env.HOST;
  const rawStaticDir = options.staticDir ?? process.env.DEVTOOLS_STATIC_DIR;

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

async function tryServeFile(
  filePath: string,
  status = 200,
): Promise<Response | null> {
  try {
    if (existsSync(filePath)) {
      const stat = statSync(filePath);
      if (stat.isFile()) {
        const file = Bun.file(filePath);
        return new Response(file, {
          status,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });
      }
    }
  } catch {
    // ignore filesystem errors
  }
  return null;
}

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

  // 1. Root route: /
  if (decodedPath === "/" || decodedPath === "") {
    const res = await tryServeFile(join(baseDir, "index.html"));
    if (res) return res;
  } else {
    // 2. Exact file match
    const exactRes = await tryServeFile(safePath);
    if (exactRes) return exactRes;

    // 3. Clean path: <path>.html
    const htmlRes = await tryServeFile(`${safePath}.html`);
    if (htmlRes) return htmlRes;

    // 4. Directory index: <path>/index.html
    const dirIndexRes = await tryServeFile(join(safePath, "index.html"));
    if (dirIndexRes) return dirIndexRes;
  }

  // 5. Unmatched: 404.html if present, else fallback
  const notFoundRes = await tryServeFile(join(baseDir, "404.html"), 404);
  if (notFoundRes) return notFoundRes;

  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function startDaemon(options: StartDaemonOptions = {}): DaemonInstance {
  const config = resolveDaemonConfig(options);
  const staticDir = resolveStaticDir(config.staticDir);

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

  console.log(
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
  };

  return {
    server,
    port: server.port ?? config.port,
    hostname: server.hostname ?? config.host,
    staticDir,
    stop,
  };
}
