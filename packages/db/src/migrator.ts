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

function hasMigrationsTable(sqlite: Database): boolean {
  const row = sqlite
    .query<{ found: number }, [string]>(
      "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(DEFAULT_MIGRATIONS_TABLE);
  return row !== null;
}

function getAppliedMigrationHashes(sqlite: Database): ReadonlySet<string> {
  const rows = sqlite
    .query<{ hash: string }, []>(
      `SELECT hash FROM "${DEFAULT_MIGRATIONS_TABLE}"`,
    )
    .all();
  return new Set(rows.map((row) => row.hash));
}

function getPendingMigrations(
  sqlite: Database,
  migrations: readonly EmbeddedMigration[],
): readonly EmbeddedMigration[] {
  if (!hasUserTables(sqlite)) {
    return migrations;
  }
  if (!hasMigrationsTable(sqlite)) {
    return [];
  }
  const appliedHashes = getAppliedMigrationHashes(sqlite);
  return migrations.filter((migration) => !appliedHashes.has(migration.hash));
}

/**
 * Applies pending embedded schema migrations inside an immediate transaction (`BEGIN IMMEDIATE`).
 *
 * @remarks
 * - Empty databases (zero user tables) receive all embedded migrations and create `__devtools_migrations`.
 * - Tracked databases with `__devtools_migrations` check applied migration SHA-256 hashes via a fast
 *   read-only query before opening a write lock, then re-check inside `BEGIN IMMEDIATE` and apply only
 *   migrations whose hash is not yet recorded.
 * - Foreign databases containing unrelated user tables without `__devtools_migrations` are left untouched.
 *
 * @param sqlite - Open `bun:sqlite` database connection.
 */
export function initializeBaselineSchema(
  sqlite: Database,
  migrations: readonly EmbeddedMigration[] = EMBEDDED_MIGRATIONS,
): void {
  if (getPendingMigrations(sqlite, migrations).length === 0) {
    return;
  }

  const applyImmediate = sqlite.transaction(() => {
    const pending = getPendingMigrations(sqlite, migrations);
    if (pending.length > 0) {
      sqlite.run(`
        CREATE TABLE IF NOT EXISTS "${DEFAULT_MIGRATIONS_TABLE}" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash text NOT NULL,
          created_at numeric
        )
      `);
      const insertStmt = sqlite.query(
        `INSERT INTO "${DEFAULT_MIGRATIONS_TABLE}" ("hash", "created_at") VALUES (?, ?)`,
      );
      for (const migration of pending) {
        for (const statement of migration.statements) {
          sqlite.run(statement);
        }
        insertStmt.run(migration.hash, migration.folderMillis);
      }
    }
  });

  applyImmediate.immediate();
}
