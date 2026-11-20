import { Database } from "bun:sqlite";
import type { EnvMap } from "@devtools/core";
import { hostShutdown, type ShutdownRegistry } from "@devtools/core/node";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { ensureParentDirectory, resolveDatabaseTargetPath } from "./config";
import { initializeBaselineSchema } from "./migrator";
import * as schema from "./schema";

/**
 * Complete relational schema map registered with the Drizzle ORM client.
 */
export type DevtoolsSchema = typeof schema;

/**
 * Typed Drizzle ORM database client backed by `bun:sqlite` and {@link DevtoolsSchema}.
 */
export type DevtoolsDb = BunSQLiteDatabase<DevtoolsSchema>;

/**
 * Configuration options for opening a lazy, concurrency-safe database handle via {@link openDb}.
 */
export interface OpenDbOptions {
  /** Optional explicit filesystem path or `":memory:"` override. */
  path?: string;
  /** Force an isolated in-memory SQLite instance regardless of environment variables. */
  memory?: boolean;
  /**
   * Automatically initialize empty databases and apply pending embedded migrations on tracked databases.
   * Pass `false` only in error-boundary tests that verify uninitialized DB failures.
   * @defaultValue true
   */
  autoInit?: boolean;
  /** Optional environment variable map overriding `process.env`. */
  env?: EnvMap;
  /** Optional working directory getter seam overriding `process.cwd()`. */
  cwd?: () => string;
  /** Optional standalone binary runtime seam overriding `Bun.isStandaloneExecutable`. */
  isStandalone?: boolean;
  /** Optional shutdown registry for Phase 3 (`"persistence"`) cleanup hook registration. */
  shutdown?: ShutdownRegistry;
  /** Optional SQLite `PRAGMA busy_timeout` duration in milliseconds. Defaults to `5000`. */
  busyTimeoutMs?: number;
  /** Optional maximum bounded cold-start / `SQLITE_BUSY` retry attempts. Defaults to `20`. */
  maxBusyRetries?: number;
}

/**
 * Managed handle around a lazily opened `bun:sqlite` + Drizzle ORM connection.
 *
 * @remarks
 * File-backed handles share one pooled connection per canonical path in the current process
 * via lease reference counting, while `":memory:"` handles remain strictly isolated.
 * All writes via {@link DbHandle.write} execute inside `BEGIN IMMEDIATE` (or nested `SAVEPOINT`s).
 */
export interface DbHandle {
  /** Resolved target path (`":memory:"` or absolute filesystem path). */
  readonly path: string;
  /** Materializes the SQLite connection, configures WAL/PRAGMAs, and applies pending embedded migrations. */
  ensureReady(): void;
  /** Executes a read operation against the Drizzle ORM database client. */
  read<T>(fn: (db: DevtoolsDb) => T): T;
  /** Executes a write operation inside a `BEGIN IMMEDIATE` transaction (or nested `SAVEPOINT`). */
  write<T>(fn: (tx: DevtoolsDb) => T): T;
  /** Releases this handle lease and checkpoints WAL + closes SQLite when the last lease closes. */
  close(): void;
  /** Releases this handle automatically when used with `using`. */
  [Symbol.dispose](): void;
}

interface RegistryLeaseGroup {
  readonly unregister: () => void;
  readonly leases: Set<() => void>;
}

interface SharedConnection {
  readonly key: string;
  readonly sqlite: Database;
  readonly db: DevtoolsDb;
  readonly isMemory: boolean;
  refCount: number;
  writeDepth: number;
  activeTx: DevtoolsDb | null;
  autoInitApplied: boolean;
  closed: boolean;
  readonly shutdownHooks: Map<ShutdownRegistry, RegistryLeaseGroup>;
}

const filePool = new Map<string, SharedConnection>();
const activeConnections = new Set<SharedConnection>();

function isSqliteBusyError(err: unknown): boolean {
  const record = (err && typeof err === "object" ? err : {}) as {
    code?: unknown;
    message?: unknown;
  };
  const msg = typeof record.message === "string" ? record.message : "";
  return (
    record.code === "SQLITE_BUSY" ||
    msg.includes("SQLITE_BUSY") ||
    msg.includes("database is locked")
  );
}

function withSqliteBusyRetry<T>(fn: () => T, maxRetries = 20): T {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return fn();
    } catch (err: unknown) {
      if (!isSqliteBusyError(err)) {
        throw err;
      }
      Bun.sleepSync(5 + (attempt + 1) * 10);
    }
  }
  return fn();
}

function forceCloseConnection(conn: SharedConnection): void {
  conn.closed = true;
  activeConnections.delete(conn);
  if (!conn.isMemory) {
    filePool.delete(conn.key);
  }
  for (const group of conn.shutdownHooks.values()) {
    group.leases.clear();
    group.unregister();
  }
  conn.shutdownHooks.clear();
  if (!conn.isMemory) {
    try {
      conn.sqlite.run("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
      // Ignore SQLITE_BUSY if another process still holds the WAL file
    }
  }
  conn.sqlite.close(true);
}

function registerLeaseShutdownHook(
  conn: SharedConnection,
  registry: ShutdownRegistry,
  releaseLease: () => void,
): () => void {
  let group = conn.shutdownHooks.get(registry);
  if (group) {
    group.leases.add(releaseLease);
  } else {
    const leases = new Set<() => void>([releaseLease]);
    const hookOptions = conn.isMemory ? undefined : { id: `db:${conn.key}` };
    const unregister = registry.register(
      "persistence",
      () => {
        for (const release of Array.from(leases)) {
          release();
        }
      },
      hookOptions,
    );
    group = { unregister, leases };
    conn.shutdownHooks.set(registry, group);
  }

  const activeGroup = group;
  return () => {
    activeGroup.leases.delete(releaseLease);
    if (activeGroup.leases.size === 0) {
      conn.shutdownHooks.delete(registry);
      activeGroup.unregister();
    }
  };
}

function applyAutoInitIfNeeded(
  conn: SharedConnection,
  autoInit: boolean,
  maxBusyRetries: number,
): void {
  if (autoInit && !conn.autoInitApplied) {
    withSqliteBusyRetry(
      () => initializeBaselineSchema(conn.sqlite),
      maxBusyRetries,
    );
    conn.autoInitApplied = true;
  }
}

function openPhysicalConnection(
  resolvedPath: string,
  isMemory: boolean,
  autoInit: boolean,
  busyTimeoutMs: number,
  maxBusyRetries: number,
): SharedConnection {
  return withSqliteBusyRetry(() => {
    if (!isMemory) {
      ensureParentDirectory(resolvedPath);
    }
    const sqlite = new Database(resolvedPath, {
      create: true,
      strict: true,
    });
    try {
      sqlite.run(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
      if (!isMemory) {
        sqlite.run("PRAGMA journal_mode = WAL;");
      }
      sqlite.run("PRAGMA foreign_keys = ON;");
      sqlite.run("PRAGMA synchronous = NORMAL;");
      if (autoInit) {
        initializeBaselineSchema(sqlite);
      }
    } catch (err: unknown) {
      sqlite.close(true);
      throw err;
    }

    const conn: SharedConnection = {
      key: resolvedPath,
      sqlite,
      db: drizzle({ client: sqlite, schema }),
      isMemory,
      refCount: 1,
      writeDepth: 0,
      activeTx: null,
      autoInitApplied: autoInit,
      closed: false,
      shutdownHooks: new Map(),
    };
    activeConnections.add(conn);
    if (!isMemory) {
      filePool.set(resolvedPath, conn);
    }
    return conn;
  }, maxBusyRetries);
}

/**
 * Opens a lazy, concurrency-safe handle to the embedded SQLite database.
 *
 * @remarks
 * Opening a handle does not touch the filesystem or initialize SQLite until the first
 * {@link DbHandle.ensureReady}, {@link DbHandle.read}, or {@link DbHandle.write} call.
 * File-backed handles share a pooled connection per resolved path and automatically
 * register a Phase 3 (`"persistence"`) cleanup hook onto `options.shutdown ?? hostShutdown`.
 *
 * @param options - Path resolution, memory isolation, auto-init, and shutdown registry seams.
 * @returns Managed {@link DbHandle}.
 */
export function openDb(options: OpenDbOptions = {}): DbHandle {
  const resolvedPath = resolveDatabaseTargetPath({
    customPath: options.path,
    memory: options.memory,
    env: options.env,
    cwd: options.cwd,
    isStandalone: options.isStandalone,
  });
  const isMemory = resolvedPath === ":memory:";
  const autoInit = options.autoInit !== false;
  const busyTimeoutMs = options.busyTimeoutMs ?? 5000;
  const maxBusyRetries = options.maxBusyRetries ?? 20;
  const shutdownRegistry = options.shutdown ?? hostShutdown;

  let conn: SharedConnection | null = null;
  let detachShutdownHook: (() => void) | null = null;
  let handleClosed = false;

  const close = (): void => {
    if (handleClosed) {
      return;
    }
    handleClosed = true;
    if (!conn || conn.closed) {
      return;
    }
    const activeConn = conn;
    detachShutdownHook?.();
    detachShutdownHook = null;
    activeConn.refCount -= 1;
    if (activeConn.refCount <= 0) {
      forceCloseConnection(activeConn);
    }
  };

  const ensureConnection = (): SharedConnection => {
    if (handleClosed || conn?.closed) {
      throw new Error("Database handle is closed");
    }

    if (conn) {
      return conn;
    }

    if (!isMemory) {
      const existing = filePool.get(resolvedPath);
      if (existing && !existing.closed) {
        applyAutoInitIfNeeded(existing, autoInit, maxBusyRetries);
        existing.refCount += 1;
        conn = existing;
        detachShutdownHook = registerLeaseShutdownHook(
          conn,
          shutdownRegistry,
          close,
        );
        return conn;
      }
    }

    conn = openPhysicalConnection(
      resolvedPath,
      isMemory,
      autoInit,
      busyTimeoutMs,
      maxBusyRetries,
    );
    detachShutdownHook = registerLeaseShutdownHook(
      conn,
      shutdownRegistry,
      close,
    );
    return conn;
  };

  return {
    path: resolvedPath,

    ensureReady() {
      ensureConnection();
    },

    read<T>(fn: (db: DevtoolsDb) => T): T {
      const active = ensureConnection();
      return fn(active.db);
    },

    write<T>(fn: (tx: DevtoolsDb) => T): T {
      const active = ensureConnection();
      const runWithTx = (tx: unknown): T => {
        const prevTx = active.activeTx;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Drizzle SQLiteTransaction exposes the full query surface of DevtoolsDb while omitting $client
        active.activeTx = tx as DevtoolsDb;
        active.writeDepth += 1;
        try {
          return fn(active.activeTx);
        } finally {
          active.writeDepth -= 1;
          active.activeTx = prevTx;
        }
      };

      if (active.writeDepth > 0 && active.activeTx) {
        return active.activeTx.transaction((nestedTx) => runWithTx(nestedTx));
      }

      return withSqliteBusyRetry(
        () =>
          active.db.transaction((tx) => runWithTx(tx), {
            behavior: "immediate",
          }),
        maxBusyRetries,
      );
    },

    close,

    [Symbol.dispose]() {
      close();
    },
  };
}

/**
 * Force-closes all active file-backed and in-memory SQLite connections in the current process.
 *
 * @remarks
 * Primarily intended for test teardown and cleanup boundaries.
 */
export function closeAllDbs(): void {
  for (const conn of Array.from(activeConnections)) {
    forceCloseConnection(conn);
  }
}
