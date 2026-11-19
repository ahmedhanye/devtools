import "./declarations.d.ts";
import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import migration0000 from "../drizzle/0000_init.sql" with { type: "text" };
import migration0001 from "../drizzle/0001_brave_lilandra.sql" with { type: "text" };
import journal from "../drizzle/meta/_journal.json" with { type: "json" };

/**
 * Minimal Drizzle migration journal entry metadata.
 */
export interface JournalEntry {
  /** Migration tag matching the SQL filename stem (for example, `"0000_init"`). */
  readonly tag: string;
  /** Epoch millisecond timestamp recorded by `drizzle-kit generate`. */
  readonly when: number;
}

/**
 * Parsed embedded SQL migration ready for execution inside a SQLite transaction.
 */
export interface EmbeddedMigration {
  /** Ordered SQL DDL statements split on Drizzle statement breakpoints. */
  readonly statements: readonly string[];
  /** Creation timestamp from the migration journal. */
  readonly folderMillis: number;
  /** Lowercase SHA-256 hex digest of the raw SQL migration file. */
  readonly hash: string;
}

const DEFAULT_MIGRATIONS_TABLE = "__devtools_migrations";

/**
 * Static map of embedded SQL migration payloads keyed by Drizzle journal tag.
 */
export const EMBEDDED_SQL_BY_TAG: Readonly<Record<string, string>> = {
  "0000_init": migration0000,
  "0001_brave_lilandra": migration0001,
};

/**
 * Resolves and validates embedded SQL migrations against Drizzle journal entries.
 *
 * @param entries - Journal entries from `drizzle/meta/_journal.json`.
 * @param sqlByTag - Map of migration tag names to embedded SQL strings.
 * @returns Parsed migration definitions with statements, timestamps, and SHA-256 hashes.
 * @throws {Error} When any journal entry tag is missing or maps to empty SQL.
 */
export function resolveEmbeddedMigrations(
  entries: readonly JournalEntry[],
  sqlByTag: Readonly<Record<string, string>> = EMBEDDED_SQL_BY_TAG,
): readonly EmbeddedMigration[] {
  return entries.map((entry) => {
    const rawSql = Object.hasOwn(sqlByTag, entry.tag)
      ? sqlByTag[entry.tag]
      : undefined;
    if (typeof rawSql !== "string" || rawSql.trim().length === 0) {
      throw new Error(
        `Missing embedded SQL migration for journal tag "${entry.tag}". Register the SQL import in packages/db/src/migrator.ts (EMBEDDED_SQL_BY_TAG).`,
      );
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
  resolveEmbeddedMigrations(journal.entries);

function hasUserTables(sqlite: Database): boolean {
  const row = sqlite
    .query(
      "SELECT count(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .get();
  return (
    typeof row === "object" &&
    row !== null &&
    "count" in row &&
    Number(row.count) > 0
  );
}

/**
 * Applies the embedded baseline schema inside an immediate transaction (`BEGIN IMMEDIATE`)
 * if and only if the target SQLite database contains zero user tables (`sqlite_master`).
 *
 * @param sqlite - Open `bun:sqlite` database connection.
 */
export function initializeBaselineSchema(sqlite: Database): void {
  if (hasUserTables(sqlite)) {
    return;
  }

  const applyImmediate = sqlite.transaction(() => {
    if (!hasUserTables(sqlite)) {
      sqlite.run(`
        CREATE TABLE IF NOT EXISTS "${DEFAULT_MIGRATIONS_TABLE}" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at numeric
        )
      `);
      const insertStmt = sqlite.query(
        `INSERT INTO "${DEFAULT_MIGRATIONS_TABLE}" ("hash", "created_at") VALUES (?, ?)`,
      );
      for (const migration of EMBEDDED_MIGRATIONS) {
        for (const statement of migration.statements) {
          sqlite.run(statement);
        }
        insertStmt.run(migration.hash, migration.folderMillis);
      }
    }
  });

  applyImmediate.immediate();
}
