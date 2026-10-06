import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "node:path";
import type { DevtoolsDb } from "./client";

export interface MigrationOptions {
  migrationsFolder?: string;
  migrationsTable?: string;
}

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
