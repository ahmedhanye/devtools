import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { Database } from "bun:sqlite";
import { createSqliteConnection } from "./connection";
import * as schema from "./schema";

export type DevtoolsSchema = typeof schema;
export type DevtoolsDb = BunSQLiteDatabase<DevtoolsSchema>;

export interface CreateDbOptions {
  path?: string;
  connection?: Database;
}

export function createDb(options: CreateDbOptions = {}): DevtoolsDb {
  const sqlite = options.connection ?? createSqliteConnection(options.path);
  return drizzle({ client: sqlite, schema });
}

let devtoolsDbInstance: DevtoolsDb | null = null;

export function getDb(): DevtoolsDb {
  if (!devtoolsDbInstance) {
    devtoolsDbInstance = createDb();
  }
  return devtoolsDbInstance;
}

export function resetDb(): void {
  devtoolsDbInstance = null;
}

export const db: DevtoolsDb = new Proxy({} as DevtoolsDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
