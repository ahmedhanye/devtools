import { Database } from "bun:sqlite";
import { resolveDatabasePath } from "./config";

/**
 * Options for initializing a native `bun:sqlite` database connection.
 */
export interface ConnectionOptions {
  /**
   * Optional explicit database file path or `":memory:"`.
   * When omitted, resolved via {@link resolveDatabasePath}.
   */
  path?: string;
  /**
   * Whether to open the SQLite connection in read-only mode without creating the file.
   * @defaultValue false
   */
  readonly?: boolean;
}

/**
 * Opens a `bun:sqlite` database handle configured with DevTools concurrency and integrity PRAGMAs.
 *
 * @remarks
 * Applies the following SQLite PRAGMAs on every connection:
 * - `journal_mode = WAL` (for file-backed databases)
 * - `busy_timeout = 5000`
 * - `foreign_keys = ON`
 * - `synchronous = NORMAL`
 *
 * @param dbPathOrOptions - Optional database path string or {@link ConnectionOptions}.
 * @returns Configured `bun:sqlite` `Database` instance.
 */
export function createSqliteConnection(
  dbPathOrOptions?: string | ConnectionOptions,
): Database {
  const options: ConnectionOptions =
    typeof dbPathOrOptions === "string"
      ? { path: dbPathOrOptions }
      : (dbPathOrOptions ?? {});

  const resolvedPath = resolveDatabasePath(options.path);
  const sqlite = new Database(resolvedPath, {
    create: !options.readonly,
    readonly: options.readonly,
    strict: true,
  });

  if (resolvedPath !== ":memory:") {
    sqlite.run("PRAGMA journal_mode = WAL;");
  }
  sqlite.run("PRAGMA busy_timeout = 5000;");
  sqlite.run("PRAGMA foreign_keys = ON;");
  sqlite.run("PRAGMA synchronous = NORMAL;");

  return sqlite;
}

/**
 * Alias for {@link createSqliteConnection}.
 */
export const createConnection = createSqliteConnection;
