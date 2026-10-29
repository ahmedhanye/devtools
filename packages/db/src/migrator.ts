import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "node:path";
import type { DevtoolsDb } from "./client";

/**
 * Customization options for programmatic Drizzle schema migrations.
 */
export interface MigrationOptions {
  /**
   * Custom directory path containing Drizzle SQL migration files and `meta/_journal.json`.
   * @defaultValue `join(import.meta.dir, "../drizzle")`
   */
  migrationsFolder?: string;
  /**
   * Custom SQLite table name used to track applied migrations.
   * @defaultValue `"__devtools_migrations"`
   */
  migrationsTable?: string;
}

/**
 * Executes pending Drizzle SQL migrations synchronously against the provided database client.
 *
 * @param db - Target {@link DevtoolsDb} instance to migrate.
 * @param options - Optional migration folder and tracking table overrides.
 */
export function runMigrations(
  db: DevtoolsDb,
  options?: MigrationOptions,
): void {
  const migrationsFolder =
    options?.migrationsFolder ?? join(import.meta.dir, "../drizzle");

  migrate(db, {
    migrationsFolder,
    migrationsTable: options?.migrationsTable ?? "__devtools_migrations",
  });
}
