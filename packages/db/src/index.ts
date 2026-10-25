/**
 * Embedded SQLite persistence layer, Drizzle ORM schemas, and migration utilities.
 *
 * @packageDocumentation
 */
export {
  createDb,
  getDb,
  closeDb,
  resetDb,
  db,
  type DevtoolsDb,
  type DevtoolsSchema,
  type CreateDbOptions,
} from "./client";
export {
  createSqliteConnection,
  createConnection,
  type ConnectionOptions,
} from "./connection";
export {
  resolveDatabasePath,
  findWorkspaceRoot,
  type ResolveDatabasePathOptions,
} from "./config";
export { runMigrations, type MigrationOptions } from "./migrator";

// Schema exports
export * from "./schema";

// Re-exported Drizzle primitives & helpers
export {
  sqliteTable,
  text,
  integer,
  blob,
  real,
  numeric,
  primaryKey,
  foreignKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export {
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  and,
  or,
  not,
  like,
  inArray,
  isNull,
  isNotNull,
  sql,
  relations,
  desc,
  asc,
  type InferSelectModel,
  type InferInsertModel,
} from "drizzle-orm";
