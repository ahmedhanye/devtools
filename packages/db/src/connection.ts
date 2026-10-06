import { Database } from "bun:sqlite";
import { resolveDatabasePath } from "./config";

export interface ConnectionOptions {
  path?: string;
  readonly?: boolean;
}

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

export const createConnection = createSqliteConnection;
