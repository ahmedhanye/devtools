/**
 * Embedded SQLite persistence layer, Drizzle ORM schemas, and lifecycle management.
 *
 * @packageDocumentation
 */
export { openDb, closeAllDbs, type DbHandle, type DevtoolsDb } from "./client";
export { resolveDatabasePath, resolveDatabaseTargetPath } from "./config";

// Schema exports
export {
  lighthouseRuns,
  schema,
  systemMetadata,
  type LighthouseRunRow,
} from "./schema";

// Re-exported Drizzle primitives & helpers
export { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export { eq, ne, and, sql, desc, asc } from "drizzle-orm";
