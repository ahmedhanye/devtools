import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { Database } from "bun:sqlite";
import type { EnvMap } from "@devtools/core";
import { createSqliteConnection } from "./connection";
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
 * Configuration options for creating an isolated {@link DevtoolsDb} instance via {@link createDb}.
 */
export interface CreateDbOptions {
  /** Optional filesystem path or `":memory:"` passed to {@link createSqliteConnection}. */
  path?: string;
  /** Optional pre-configured `bun:sqlite` `Database` handle. */
  connection?: Database;
  /** Optional environment variable map overriding `process.env`. */
  env?: EnvMap;
}

/**
 * Instantiates a new Drizzle ORM database client bound to a `bun:sqlite` connection.
 *
 * @param options - Connection path, environment seam, or pre-existing SQLite handle options.
 * @returns Fresh {@link DevtoolsDb} client instance.
 */
export function createDb(options: CreateDbOptions = {}): DevtoolsDb {
  const sqlite =
    options.connection ??
    createSqliteConnection({ path: options.path, env: options.env });
  return drizzle({ client: sqlite, schema });
}

let devtoolsDbInstance: DevtoolsDb | null = null;
let devtoolsSqliteConnection: Database | null = null;

/**
 * Returns the lazily initialized process-wide {@link DevtoolsDb} singleton.
 *
 * @remarks
 * Creates the underlying SQLite connection on first invocation. Call {@link closeDb}
 * or {@link resetDb} to release the singleton handle.
 *
 * @param options - Optional connection path or environment seam used if the singleton is initialized.
 * @returns Shared {@link DevtoolsDb} singleton instance.
 */
export function getDb(options: CreateDbOptions = {}): DevtoolsDb {
  if (!devtoolsDbInstance) {
    devtoolsSqliteConnection =
      options.connection ??
      createSqliteConnection({ path: options.path, env: options.env });
    devtoolsDbInstance = drizzle({ client: devtoolsSqliteConnection, schema });
  }
  return devtoolsDbInstance;
}

/**
 * Closes the active singleton SQLite connection (checkpointing WAL journals) and clears the cached instance.
 *
 * @remarks
 * Safe to call multiple times or when no singleton connection has been opened.
 */
export function closeDb(): void {
  if (devtoolsSqliteConnection) {
    try {
      devtoolsSqliteConnection.close();
    } catch {
      // Ignore close errors on already-closed handles
    }
    devtoolsSqliteConnection = null;
  }
  devtoolsDbInstance = null;
}

/**
 * Resets the cached {@link DevtoolsDb} singleton and closes any active underlying SQLite handle.
 *
 * @remarks
 * Primarily used in test suites and daemon shutdown hooks to guarantee clean state between runs.
 */
export function resetDb(): void {
  closeDb();
}

/**
 * Lazy proxy forwarding all property accesses to the active {@link getDb} singleton.
 *
 * @remarks
 * Allows modules to import `db` at the top level without triggering filesystem I/O
 * or SQLite connection initialization until a query is actually executed.
 */
export const db: DevtoolsDb = new Proxy({} as DevtoolsDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
