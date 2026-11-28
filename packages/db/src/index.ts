/**
 * Embedded SQLite persistence layer, Drizzle ORM schemas, and lifecycle management.
 *
 * @packageDocumentation
 */
export {
  openDb,
  type DbHandle,
  type DbSession,
  type DevtoolsDb,
  type OpenDbOptions,
} from "./client";
export { resolveDatabasePath, resolveDatabaseTargetPath } from "./config";

// Schema exports
export {
  lighthouseRuns,
  schema,
  systemMetadata,
  type LighthouseRunRow,
} from "./schema/schema";

// Re-exported Drizzle primitives & helpers
export { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export { eq, ne, and, sql, desc, asc, gte, lt } from "drizzle-orm";
