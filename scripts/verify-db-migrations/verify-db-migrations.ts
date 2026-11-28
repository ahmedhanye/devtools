import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type DrizzleSQLiteSnapshotJSON,
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import {
  EMBEDDED_SQL_BY_TAG,
  type JournalEntry,
} from "../../packages/db/src/migrator";
import { schema } from "../../packages/db/src/schema/schema";

/**
 * Minimal subprocess result interface for injectable command execution in tests.
 */
export interface CommandResult {
  /** Subprocess exit code (`0` indicates success). */
  exitCode: number;
  /** Standard output buffer or string. */
  stdout: { toString(): string } | string;
  /** Optional standard error buffer or string. */
  stderr?: { toString(): string } | string;
}

/**
 * Subprocess execution seam matching `Bun.spawnSync`.
 */
export type SpawnCommandFn = (
  args: string[],
  options?: { cwd?: string },
) => CommandResult;

/**
 * Outcome returned by individual database migration parity checks.
 */
export interface VerificationOutcome {
  /** Whether the check succeeded with zero drift or missing registrations. */
  ok: boolean;
  /** Actionable human-readable diagnostic messages when `ok` is `false`. */
  errors: string[];
}

function defaultSpawn(
  args: string[],
  options?: { cwd?: string },
): CommandResult {
  return Bun.spawnSync(args, options);
}

/**
 * Verifies bijective parity between Drizzle `_journal.json` entries, disk `.sql` files,
 * and `EMBEDDED_SQL_BY_TAG` inside `packages/db/src/migrator.ts`.
 *
 * @param journalEntries - Entries loaded from `packages/db/drizzle/meta/_journal.json`.
 * @param embeddedSqlByTag - Embedded SQL map exported by `packages/db/src/migrator.ts`.
 * @param readDiskSql - Reader returning raw SQL file text for a migration tag, or `null` if missing.
 * @returns Verification result detailing any missing, empty, mismatched, or orphaned tags.
 */
export function verifyJournalAndEmbeddedParity(
  journalEntries: readonly JournalEntry[],
  embeddedSqlByTag: Readonly<Record<string, string>>,
  readDiskSql: (tag: string) => string | null,
): VerificationOutcome {
  const errors: string[] = [];
  const journalTags = new Set<string>();

  for (const entry of journalEntries) {
    journalTags.add(entry.tag);

    const diskSql = readDiskSql(entry.tag);
    if (diskSql === null) {
      errors.push(
        `Missing SQL migration file on disk for journal tag "${entry.tag}".`,
      );
      continue;
    }

    if (!Object.hasOwn(embeddedSqlByTag, entry.tag)) {
      errors.push(
        `Journal tag "${entry.tag}" is missing from EMBEDDED_SQL_BY_TAG in packages/db/src/migrator.ts.`,
      );
      continue;
    }

    const embeddedSql = embeddedSqlByTag[entry.tag];
    if (typeof embeddedSql !== "string" || embeddedSql.trim().length === 0) {
      errors.push(
        `EMBEDDED_SQL_BY_TAG["${entry.tag}"] is empty in packages/db/src/migrator.ts.`,
      );
      continue;
    }

    if (embeddedSql !== diskSql) {
      errors.push(
        `EMBEDDED_SQL_BY_TAG["${entry.tag}"] differs from packages/db/drizzle/${entry.tag}.sql.`,
      );
    }
  }

  for (const registeredTag of Object.keys(embeddedSqlByTag)) {
    if (!journalTags.has(registeredTag)) {
      errors.push(
        `EMBEDDED_SQL_BY_TAG contains unregistered tag "${registeredTag}" absent from _journal.json.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Compares the live Drizzle schema object non-interactively against the latest snapshot JSON
 * to detect un-migrated schema edits with zero disk writes.
 *
 * @param liveSchema - Aggregated Drizzle table definitions (`packages/db/src/schema`).
 * @param latestSnapshotJson - Latest serialized snapshot from `packages/db/drizzle/meta/*_snapshot.json`.
 * @returns Verification outcome indicating whether the live schema matches the snapshot.
 */
export async function verifySchemaMatchesLatestSnapshot(
  liveSchema: Record<string, unknown>,
  latestSnapshotJson: DrizzleSQLiteSnapshotJSON,
): Promise<VerificationOutcome> {
  const errors: string[] = [];
  const currentJson = await generateSQLiteDrizzleJson(liveSchema);
  const statements = await generateSQLiteMigration(
    latestSnapshotJson,
    currentJson,
  );

  const tablesMatch = Bun.deepEquals(
    latestSnapshotJson.tables,
    currentJson.tables,
  );
  const viewsMatch = Bun.deepEquals(
    latestSnapshotJson.views,
    currentJson.views,
  );
  const enumsMatch = Bun.deepEquals(
    latestSnapshotJson.enums,
    currentJson.enums,
  );
  const internalMatch = Bun.deepEquals(
    latestSnapshotJson.internal,
    currentJson.internal,
  );

  if (
    statements.length > 0 ||
    !tablesMatch ||
    !viewsMatch ||
    !enumsMatch ||
    !internalMatch
  ) {
    const details =
      statements.length > 0
        ? ` Pending SQL:\n${statements.join("\n")}`
        : ` Snapshot mismatch (tables=${tablesMatch}, views=${viewsMatch}, enums=${enumsMatch}, internal=${internalMatch}).`;
    errors.push(
      `Database schema drift detected: live Drizzle schema differs from the latest snapshot. Run "bun --filter @devtools/db db:generate", register the SQL in packages/db/src/migrator.ts, and stage packages/db/drizzle/.${details}`,
    );
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Verifies that `packages/db/drizzle/` contains no unstaged modifications or untracked files
 * so newly generated migrations cannot be accidentally omitted from a commit.
 *
 * @param spawnFn - Injectable subprocess runner defaulting to `Bun.spawnSync`.
 * @returns Verification outcome failing if unstaged or untracked migration files exist.
 */
export function verifyNoUnstagedDrizzleFiles(
  spawnFn: SpawnCommandFn = defaultSpawn,
): VerificationOutcome {
  const proc = spawnFn([
    "git",
    "status",
    "--porcelain",
    "--",
    "packages/db/drizzle",
  ]);
  if (proc.exitCode !== 0) {
    return {
      ok: false,
      errors: [
        `Failed to inspect git status for packages/db/drizzle (exit code ${proc.exitCode}): ${proc.stderr?.toString() ?? ""}`,
      ],
    };
  }

  const lines = proc.stdout
    .toString()
    .split("\n")
    .filter((line) => line.length > 0);
  const unstaged = lines.filter(
    (line) =>
      line.startsWith("??") || (line[1] !== undefined && line[1] !== " "),
  );

  if (unstaged.length > 0) {
    return {
      ok: false,
      errors: [
        `Unstaged or untracked migration artifacts detected in packages/db/drizzle/:\n${unstaged.map((l) => `  ${l}`).join("\n")}\nStage all generated migration files before committing.`,
      ],
    };
  }

  return { ok: true, errors: [] };
}

/**
 * Executes `bunx --bun drizzle-kit check` inside `packages/db` to validate snapshot history integrity.
 *
 * @param dbPackageDir - Absolute path to `packages/db`.
 * @param spawnFn - Injectable subprocess runner defaulting to `Bun.spawnSync`.
 * @returns Verification outcome failing if `drizzle-kit check` exits non-zero.
 */
export function runDrizzleKitCheck(
  dbPackageDir: string,
  spawnFn: SpawnCommandFn = defaultSpawn,
): VerificationOutcome {
  const proc = spawnFn(["bunx", "--bun", "drizzle-kit", "check"], {
    cwd: dbPackageDir,
  });
  if (proc.exitCode !== 0) {
    const output = [proc.stdout.toString(), proc.stderr?.toString() ?? ""]
      .filter((chunk) => chunk.trim().length > 0)
      .join("\n");
    return {
      ok: false,
      errors: [
        `drizzle-kit check failed (exit code ${proc.exitCode})${output ? `:\n${output}` : "."}`,
      ],
    };
  }
  return { ok: true, errors: [] };
}

/**
 * Resolves the latest snapshot JSON file path from parsed Drizzle journal entries.
 */
export function resolveLatestSnapshotPath(
  drizzleDir: string,
  entries: readonly (JournalEntry & { idx?: number })[],
): string {
  const latest = entries[entries.length - 1];
  if (!latest) {
    throw new Error("Drizzle migration journal contains zero entries.");
  }
  const prefixIndex = latest.idx ?? entries.length - 1;
  const padded = String(prefixIndex).padStart(4, "0");
  return join(drizzleDir, "meta", `${padded}_snapshot.json`);
}

/**
 * Executes all database migration and schema-drift verification checks.
 *
 * @param argv - CLI argument vector (supports `--check-git-status`).
 * @param options - Optional overrides for testing.
 * @returns Combined {@link VerificationOutcome}.
 */
export async function runVerifyDbMigrations(
  argv: readonly string[] = process.argv.slice(2),
  options?: {
    dbPackageDir?: string;
    spawnFn?: SpawnCommandFn;
  },
): Promise<VerificationOutcome> {
  const checkGitStatus = argv.includes("--check-git-status");
  const dbPackageDir =
    options?.dbPackageDir ?? resolve(import.meta.dir, "../../packages/db");
  const drizzleDir = join(dbPackageDir, "drizzle");
  const spawnFn = options?.spawnFn ?? defaultSpawn;

  const journalPath = join(drizzleDir, "meta", "_journal.json");
  const parsedJournal: unknown = JSON.parse(readFileSync(journalPath, "utf8"));
  const rawEntries: unknown[] =
    typeof parsedJournal === "object" &&
    parsedJournal !== null &&
    "entries" in parsedJournal &&
    Array.isArray(parsedJournal.entries)
      ? parsedJournal.entries
      : [];
  const entries: Array<JournalEntry & { idx?: number }> = rawEntries.flatMap(
    (entry) => {
      if (
        typeof entry === "object" &&
        entry !== null &&
        "tag" in entry &&
        typeof entry.tag === "string"
      ) {
        return [
          {
            tag: entry.tag,
            when:
              "when" in entry && typeof entry.when === "number"
                ? entry.when
                : 0,
            idx:
              "idx" in entry && typeof entry.idx === "number"
                ? entry.idx
                : undefined,
          },
        ];
      }
      return [];
    },
  );
  const journal = { entries };

  const errors: string[] = [];

  const parity = verifyJournalAndEmbeddedParity(
    journal.entries,
    EMBEDDED_SQL_BY_TAG,
    (tag) => {
      const sqlPath = join(drizzleDir, `${tag}.sql`);
      return existsSync(sqlPath) ? readFileSync(sqlPath, "utf8") : null;
    },
  );
  errors.push(...parity.errors);

  const latestSnapshotPath = resolveLatestSnapshotPath(
    drizzleDir,
    journal.entries,
  );
  if (!existsSync(latestSnapshotPath)) {
    errors.push(`Missing Drizzle snapshot file: ${latestSnapshotPath}`);
  } else {
    const latestSnapshot = JSON.parse(
      readFileSync(latestSnapshotPath, "utf8"),
    ) as DrizzleSQLiteSnapshotJSON;
    const schemaCheck = await verifySchemaMatchesLatestSnapshot(
      schema,
      latestSnapshot,
    );
    errors.push(...schemaCheck.errors);
  }

  const kitCheck = runDrizzleKitCheck(dbPackageDir, spawnFn);
  errors.push(...kitCheck.errors);

  if (checkGitStatus) {
    const gitCheck = verifyNoUnstagedDrizzleFiles(spawnFn);
    errors.push(...gitCheck.errors);
  }

  return { ok: errors.length === 0, errors };
}

async function main(): Promise<void> {
  const startTime = performance.now();
  const outcome = await runVerifyDbMigrations();
  const elapsed = (performance.now() - startTime).toFixed(1);

  if (!outcome.ok) {
    console.error("\n❌ Database Migration Verification Failed:\n");
    for (const err of outcome.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    `✅ Database schema and migration verification passed (${elapsed}ms).`,
  );
}

if (import.meta.main) {
  await main();
}
