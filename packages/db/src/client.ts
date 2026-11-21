import { Database } from "bun:sqlite";
import type { EnvMap } from "@devtools/core";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { ensureParentDirectory, resolveDatabaseTargetPath } from "./config";
import { initializeBaselineSchema } from "./migrator";
import { schema } from "./schema";

const DEFAULT_BUSY_TIMEOUT_MS = 5000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

/**
 * Drizzle ORM database instance bound to the devtools schema.
 */
export type DevtoolsDb = BunSQLiteDatabase<typeof schema>;

/**
 * Borrowed read/write session passed to application stores and repositories.
 *
 * Exposes query and transaction execution without exposing connection
 * ownership or `close()` so domain code cannot close a shared caller handle.
 */
export interface DbSession {
  readonly path: string;
  ensureReady(): void;
  read<T>(fn: (db: DevtoolsDb) => T): T;
  write<T>(fn: (tx: DevtoolsDb) => T): T;
}

/**
 * Composition-root database handle that owns connection lifecycle and disposal.
 */
export interface DbHandle extends DbSession {
  close(): void;
  [Symbol.dispose](): void;
}

/**
 * Configuration options for {@link openDb}.
 */
export interface OpenDbOptions {
  /** Explicit SQLite file path (or `":memory:"`). Overrides env and defaults. */
  path?: string;
  /** Open an isolated in-memory database instead of a file on disk. */
  memory?: boolean;
  /** Apply embedded schema migrations automatically on first physical open. */
  autoInit?: boolean;
  /** Optional environment map used for database path resolution. */
  env?: EnvMap;
  /** Optional working-directory provider for relative paths. */
  cwd?: () => string;
  /** Mark invocation as standalone CLI/API mode when resolving database path. */
  isStandalone?: boolean;
  /** SQLite `PRAGMA busy_timeout` in milliseconds (default `5000`). */
  busyTimeoutMs?: number;
  /**
   * Idle timeout in milliseconds before closing file-backed SQLite connections
   * automatically (default `30000`; `0` disables idle-close; always `0` for `:memory:`).
   */
  idleTimeoutMs?: number;
}

interface PhysicalConnection {
  sqlite: Database;
  db: DevtoolsDb;
  activeTx: DevtoolsDb | null;
  writeDepth: number;
}

function assertNonNegativeInt(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
  return value;
}

function configureSqlitePragmas(
  sqlite: Database,
  isMemory: boolean,
  busyTimeoutMs: number,
): void {
  sqlite.run(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
  sqlite.run("PRAGMA foreign_keys = ON;");
  if (!isMemory) {
    sqlite.run("PRAGMA journal_mode = WAL;");
    sqlite.run("PRAGMA synchronous = NORMAL;");
  }
}

function openPhysicalConnection(
  targetPath: string,
  isMemory: boolean,
  autoInit: boolean,
  busyTimeoutMs: number,
): PhysicalConnection {
  ensureParentDirectory(targetPath);

  const sqlite = new Database(targetPath, { create: true });
  try {
    configureSqlitePragmas(sqlite, isMemory, busyTimeoutMs);
    if (autoInit) {
      initializeBaselineSchema(sqlite);
    }
    const db = drizzle(sqlite, { schema });
    return {
      sqlite,
      db,
      activeTx: null,
      writeDepth: 0,
    };
  } catch (error) {
    sqlite.close(true);
    throw error;
  }
}

/**
 * Create a lazy SQLite database handle with explicit ownership and automatic idle-close.
 *
 * File-backed handles defer opening SQLite until first access, execute migrations
 * idempotently when `autoInit` is enabled, idle-close cleanly via an unreffed
 * timer (`PRAGMA busy_timeout = 0` -> `PRAGMA optimize` -> `sqlite.close(true)`),
 * and reopen transparently on subsequent calls.
 *
 * @param options Database path, pragma, and lifecycle options.
 * @returns An owner-scoped {@link DbHandle} supporting `using` disposal.
 * @throws {RangeError} When `busyTimeoutMs` or `idleTimeoutMs` is negative or non-integer.
 */
export function openDb(options: OpenDbOptions = {}): DbHandle {
  const targetPath = resolveDatabaseTargetPath({
    customPath: options.path,
    memory: options.memory,
    env: options.env,
    cwd: options.cwd,
    isStandalone: options.isStandalone,
  });
  const isMemory = targetPath === ":memory:";
  const autoInit = options.autoInit ?? true;
  const busyTimeoutMs = assertNonNegativeInt(
    options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
    "busyTimeoutMs",
  );
  const requestedIdleMs = assertNonNegativeInt(
    options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    "idleTimeoutMs",
  );
  const idleTimeoutMs = isMemory ? 0 : requestedIdleMs;

  let conn: PhysicalConnection | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let handleClosed = false;
  let savepointSeq = 0;

  function clearIdleTimer(): void {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function closePhysicalConnection(active: PhysicalConnection): void {
    clearIdleTimer();
    conn = null;
    if (!isMemory) {
      try {
        // Zero busy_timeout first so PRAGMA optimize skips rather than stalls under external writers.
        active.sqlite.run("PRAGMA busy_timeout = 0;");
        active.sqlite.run("PRAGMA optimize;");
      } catch {
        // Ignore optimize failures on teardown or transient lock contention.
      }
    }
    // Drizzle creates uncached statements; force close(true) so -wal/-shm sidecars are cleaned up immediately.
    active.sqlite.close(true);
  }

  function scheduleIdleTimer(): void {
    clearIdleTimer();
    if (
      handleClosed ||
      idleTimeoutMs <= 0 ||
      conn === null ||
      conn.writeDepth > 0
    ) {
      return;
    }
    const timer = setTimeout(() => {
      idleTimer = null;
      if (conn !== null && conn.writeDepth === 0) {
        closePhysicalConnection(conn);
      }
    }, idleTimeoutMs);
    timer.unref();
    idleTimer = timer;
  }

  function ensureConnection(): PhysicalConnection {
    if (handleClosed) {
      throw new Error("Database handle is closed");
    }
    clearIdleTimer();
    if (conn === null) {
      conn = openPhysicalConnection(
        targetPath,
        isMemory,
        autoInit,
        busyTimeoutMs,
      );
    }
    return conn;
  }

  return {
    path: targetPath,
    ensureReady(): void {
      ensureConnection();
      scheduleIdleTimer();
    },
    read<T>(fn: (db: DevtoolsDb) => T): T {
      const active = ensureConnection();
      try {
        return fn(active.activeTx ?? active.db);
      } finally {
        scheduleIdleTimer();
      }
    },
    write<T>(fn: (tx: DevtoolsDb) => T): T {
      const active = ensureConnection();
      if (active.activeTx !== null) {
        const spName = `devtools_sp_${++savepointSeq}`;
        active.sqlite.run(`SAVEPOINT ${spName};`);
        active.writeDepth += 1;
        try {
          const result = fn(active.activeTx);
          active.sqlite.run(`RELEASE SAVEPOINT ${spName};`);
          return result;
        } catch (error) {
          active.sqlite.run(
            `ROLLBACK TO SAVEPOINT ${spName}; RELEASE SAVEPOINT ${spName};`,
          );
          throw error;
        } finally {
          active.writeDepth -= 1;
        }
      }

      try {
        return active.db.transaction(
          (tx) => {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Drizzle SQLiteTransaction shares the full DevtoolsDb query API inside a transaction callback.
            active.activeTx = tx as unknown as DevtoolsDb;
            active.writeDepth = 1;
            try {
              return fn(active.activeTx);
            } finally {
              active.activeTx = null;
              active.writeDepth = 0;
            }
          },
          { behavior: "immediate" },
        );
      } finally {
        scheduleIdleTimer();
      }
    },
    close(): void {
      handleClosed = true;
      clearIdleTimer();
      if (conn !== null) {
        closePhysicalConnection(conn);
      }
    },
    [Symbol.dispose](): void {
      this.close();
    },
  };
}
