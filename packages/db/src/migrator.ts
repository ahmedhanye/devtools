import "./declarations.d.ts";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import migration0000 from "../drizzle/0000_init.sql" with { type: "text" };
import migration0001 from "../drizzle/0001_brave_lilandra.sql" with { type: "text" };
import journal from "../drizzle/meta/_journal.json" with { type: "json" };
import type { DevtoolsDb } from "./client";

/**
 * Customization options for programmatic Drizzle schema migrations.
 */
export interface MigrationOptions {
  /**
   * Custom directory path containing Drizzle SQL migration files and `meta/_journal.json`.
   * When omitted, uses the embedded SQL migrations bundled into `@devtools/db`.
   */
  migrationsFolder?: string;
  /**
   * Custom SQLite table name used to track applied migrations.
   * @defaultValue `"__devtools_migrations"`
   */
  migrationsTable?: string;
}

/**
 * Minimal Drizzle journal entry metadata required to resolve an embedded SQL migration.
 */
export interface EmbeddedJournalEntry {
  /** Migration file tag matching the key in the bundled SQL lookup map. */
  readonly tag: string;
  /** Epoch millisecond timestamp recorded in Drizzle's `_journal.json`. */
  readonly when: number;
}

/**
 * Parsed embedded migration ready for transactional execution by {@link runMigrations}.
 */
export interface EmbeddedMigration {
  /** Individual SQL statements split on Drizzle's statement breakpoint marker. */
  readonly statements: readonly string[];
  /** Epoch millisecond timestamp matching Drizzle's `created_at` migration watermark. */
  readonly folderMillis: number;
  /** SHA-256 hex digest of the raw SQL file matching Drizzle's folder migrator. */
  readonly hash: string;
}

const EMBEDDED_SQL_BY_TAG: Record<string, string> = {
  "0000_init": migration0000,
  "0001_brave_lilandra": migration0001,
};

/**
 * Builds ordered embedded migration descriptors from Drizzle journal entries and bundled SQL strings.
 *
 * @param entries - Journal entries defining migration tags and timestamps.
 * @param sqlByTag - Map from migration tag to raw SQL file contents.
 * @returns Ordered array of {@link EmbeddedMigration} descriptors.
 * @throws {@link Error} When any journal entry tag is absent from `sqlByTag`.
 */
export function buildEmbeddedMigrations(
  entries: readonly EmbeddedJournalEntry[],
  sqlByTag: Readonly<Record<string, string>>,
): readonly EmbeddedMigration[] {
  return entries.map((entry) => {
    const rawSql = Object.hasOwn(sqlByTag, entry.tag)
      ? sqlByTag[entry.tag]
      : undefined;
    if (rawSql === undefined) {
      throw new Error(`Missing embedded migration SQL for ${entry.tag}`);
    }
    return {
      statements: rawSql
        .split("--> statement-breakpoint")
        .filter((statement) => statement.trim().length > 0),
      folderMillis: entry.when,
      hash: createHash("sha256").update(rawSql).digest("hex"),
    };
  });
}

const EMBEDDED_MIGRATIONS: readonly EmbeddedMigration[] =
  buildEmbeddedMigrations(journal.entries, EMBEDDED_SQL_BY_TAG);

function runEmbeddedMigrations(db: DevtoolsDb, migrationsTable: string): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  const appliedRows = db.values<[unknown, unknown, number | string]>(
    sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`,
  );
  const lastAppliedMillis = appliedRows[0] ? Number(appliedRows[0][2]) : null;

  db.transaction((tx) => {
    for (const migration of EMBEDDED_MIGRATIONS) {
      if (
        lastAppliedMillis === null ||
        lastAppliedMillis < migration.folderMillis
      ) {
        for (const statement of migration.statements) {
          tx.run(sql.raw(statement));
        }
        tx.run(
          sql`INSERT INTO ${sql.identifier(migrationsTable)} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
        );
      }
    }
  });
}

/**
 * Executes pending Drizzle SQL migrations synchronously against the provided database client.
 *
 * @param db - Target {@link DevtoolsDb} instance to migrate.
 * @param options - Optional migration folder and tracking table overrides.
 * @throws {@link Error} When `options.migrationsFolder` is empty or whitespace-only, or when migration execution fails.
 */
export function runMigrations(
  db: DevtoolsDb,
  options?: MigrationOptions,
): void {
  const migrationsTable = options?.migrationsTable ?? "__devtools_migrations";

  if (options?.migrationsFolder !== undefined) {
    if (options.migrationsFolder.trim().length === 0) {
      throw new Error("migrationsFolder must be a non-empty directory path");
    }
    migrate(db, {
      migrationsFolder: options.migrationsFolder,
      migrationsTable,
    });
    return;
  }

  runEmbeddedMigrations(db, migrationsTable);
}
