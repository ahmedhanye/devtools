import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  generateSQLiteDrizzleJson,
  type DrizzleSQLiteSnapshotJSON,
} from "drizzle-kit/api";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  resolveLatestSnapshotPath,
  runDrizzleKitCheck,
  runVerifyDbMigrations,
  verifyJournalAndEmbeddedParity,
  verifyNoUnstagedDrizzleFiles,
  verifySchemaMatchesLatestSnapshot,
  type SpawnCommandFn,
} from "./verify-db-migrations";

describe("verifyJournalAndEmbeddedParity", () => {
  it("passes when journal, disk SQL files, and EMBEDDED_SQL_BY_TAG match bijectively", () => {
    const diskFiles: Record<string, string> = {
      "0000_init": "CREATE TABLE a (id text);",
      "0001_next": "CREATE TABLE b (id text);",
    };
    const outcome = verifyJournalAndEmbeddedParity(
      [
        { tag: "0000_init", when: 1 },
        { tag: "0001_next", when: 2 },
      ],
      { ...diskFiles },
      (tag) => diskFiles[tag] ?? null,
    );
    expect(outcome).toEqual({ ok: true, errors: [] });
  });

  it("reports missing disk files, missing/empty/mismatched embedded entries, and orphaned tags", () => {
    const diskFiles: Record<string, string> = {
      "0001_missing_embed": "CREATE TABLE a (id text);",
      "0002_empty_embed": "CREATE TABLE b (id text);",
      "0003_mismatch": "CREATE TABLE c (id text);",
    };
    const outcome = verifyJournalAndEmbeddedParity(
      [
        { tag: "0000_missing_disk", when: 1 },
        { tag: "0001_missing_embed", when: 2 },
        { tag: "0002_empty_embed", when: 3 },
        { tag: "0003_mismatch", when: 4 },
      ],
      {
        "0002_empty_embed": "   ",
        "0003_mismatch": "CREATE TABLE other (id text);",
        "9999_orphan": "CREATE TABLE z (id text);",
      },
      (tag) => diskFiles[tag] ?? null,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.errors).toEqual([
      'Missing SQL migration file on disk for journal tag "0000_missing_disk".',
      'Journal tag "0001_missing_embed" is missing from EMBEDDED_SQL_BY_TAG in packages/db/src/migrator.ts.',
      'EMBEDDED_SQL_BY_TAG["0002_empty_embed"] is empty in packages/db/src/migrator.ts.',
      'EMBEDDED_SQL_BY_TAG["0003_mismatch"] differs from packages/db/drizzle/0003_mismatch.sql.',
      'EMBEDDED_SQL_BY_TAG contains unregistered tag "9999_orphan" absent from _journal.json.',
    ]);
  });
});

describe("verifySchemaMatchesLatestSnapshot", () => {
  it("passes when live schema matches snapshot and detects un-migrated columns", async () => {
    const tableV1 = sqliteTable("sample_items", {
      id: text("id").primaryKey(),
    });
    const snapshotV1 = (await generateSQLiteDrizzleJson({
      sampleItems: tableV1,
    })) as DrizzleSQLiteSnapshotJSON;

    const cleanOutcome = await verifySchemaMatchesLatestSnapshot(
      { sampleItems: tableV1 },
      snapshotV1,
    );
    expect(cleanOutcome).toEqual({ ok: true, errors: [] });

    const tableV2 = sqliteTable("sample_items", {
      id: text("id").primaryKey(),
      label: text("label").notNull(),
    });
    const driftOutcome = await verifySchemaMatchesLatestSnapshot(
      { sampleItems: tableV2 },
      snapshotV1,
    );
    expect(driftOutcome.ok).toBe(false);
    expect(driftOutcome.errors[0]).toContain("Database schema drift detected");
    expect(driftOutcome.errors[0]).toContain("Pending SQL:");
  });

  it("detects structural snapshot divergence even when no DDL statements are emitted", async () => {
    const tableV1 = sqliteTable("sample_items", {
      id: text("id").primaryKey(),
    });
    const snapshotV1 = (await generateSQLiteDrizzleJson({
      sampleItems: tableV1,
    })) as DrizzleSQLiteSnapshotJSON;

    const alteredSnapshot: DrizzleSQLiteSnapshotJSON = {
      ...snapshotV1,
      views: {
        fake_view: {
          name: "fake_view",
          columns: {},
          isExisting: true,
        },
      } as DrizzleSQLiteSnapshotJSON["views"],
    };

    const outcome = await verifySchemaMatchesLatestSnapshot(
      { sampleItems: tableV1 },
      alteredSnapshot,
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]).toContain("views=false");
  });
});

describe("verifyNoUnstagedDrizzleFiles", () => {
  it("passes when git status shows clean or only staged drizzle files", () => {
    const cleanSpawn: SpawnCommandFn = () => ({ exitCode: 0, stdout: "" });
    expect(verifyNoUnstagedDrizzleFiles(cleanSpawn)).toEqual({
      ok: true,
      errors: [],
    });

    const stagedSpawn: SpawnCommandFn = () => ({
      exitCode: 0,
      stdout:
        "A  packages/db/drizzle/0002_test.sql\nM  packages/db/drizzle/meta/_journal.json\n",
    });
    expect(verifyNoUnstagedDrizzleFiles(stagedSpawn)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("fails when unstaged or untracked drizzle files exist or git fails", () => {
    const unstagedSpawn: SpawnCommandFn = () => ({
      exitCode: 0,
      stdout:
        " M packages/db/drizzle/meta/_journal.json\n?? packages/db/drizzle/0002_test.sql\n",
    });
    const res = verifyNoUnstagedDrizzleFiles(unstagedSpawn);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain(
      "Unstaged or untracked migration artifacts",
    );

    const errorSpawn: SpawnCommandFn = () => ({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: not a git repository",
    });
    const errRes = verifyNoUnstagedDrizzleFiles(errorSpawn);
    expect(errRes.ok).toBe(false);
    expect(errRes.errors[0]).toContain("Failed to inspect git status");
  });
});

describe("runDrizzleKitCheck", () => {
  it("returns ok on exit code 0 and formats stderr/stdout on failure", () => {
    const okSpawn: SpawnCommandFn = (args, opts) => {
      expect(args).toEqual(["bunx", "--bun", "drizzle-kit", "check"]);
      expect(opts?.cwd).toBe("/tmp/db");
      return { exitCode: 0, stdout: "Everything's fine" };
    };
    expect(runDrizzleKitCheck("/tmp/db", okSpawn)).toEqual({
      ok: true,
      errors: [],
    });

    const failSpawn: SpawnCommandFn = () => ({
      exitCode: 1,
      stdout: "Collision detected",
      stderr: "Error",
    });
    const failRes = runDrizzleKitCheck("/tmp/db", failSpawn);
    expect(failRes.ok).toBe(false);
    expect(failRes.errors[0]).toContain("drizzle-kit check failed");
    expect(failRes.errors[0]).toContain("Collision detected");
  });
});

describe("resolveLatestSnapshotPath & runVerifyDbMigrations", () => {
  it("resolves padded snapshot filenames and throws on empty journals", () => {
    expect(
      resolveLatestSnapshotPath("/tmp/drizzle", [
        { tag: "0000_init", when: 1, idx: 0 },
        { tag: "0001_next", when: 2, idx: 1 },
      ]),
    ).toBe("/tmp/drizzle/meta/0001_snapshot.json");

    expect(() => resolveLatestSnapshotPath("/tmp/drizzle", [])).toThrow(
      "Drizzle migration journal contains zero entries.",
    );
  });

  it("verifies the real packages/db schema, journal, embedded SQL, and snapshots end-to-end", async () => {
    const outcome = await runVerifyDbMigrations([]);
    expect(outcome).toEqual({ ok: true, errors: [] });
  });

  it("reports missing snapshot file and forwards --check-git-status", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-verify-"));
    try {
      const metaDir = join(tmpDir, "drizzle", "meta");
      mkdirSync(metaDir, { recursive: true });
      writeFileSync(
        join(metaDir, "_journal.json"),
        JSON.stringify({
          entries: [{ idx: 0, tag: "0000_init", when: 1 }],
        }),
      );
      writeFileSync(join(tmpDir, "drizzle", "0000_init.sql"), "-- sql");

      const spawnCalls: string[][] = [];
      const mockSpawn: SpawnCommandFn = (args) => {
        spawnCalls.push(args);
        if (args[0] === "git") {
          return {
            exitCode: 0,
            stdout: "?? packages/db/drizzle/0002_untracked.sql\n",
          };
        }
        return { exitCode: 0, stdout: "ok" };
      };

      const outcome = await runVerifyDbMigrations(["--check-git-status"], {
        dbPackageDir: tmpDir,
        spawnFn: mockSpawn,
      });

      expect(outcome.ok).toBe(false);
      expect(
        outcome.errors.some((e) => e.includes("Missing Drizzle snapshot file")),
      ).toBe(true);
      expect(
        outcome.errors.some((e) =>
          e.includes("Unstaged or untracked migration artifacts"),
        ),
      ).toBe(true);
      expect(spawnCalls.some((c) => c[0] === "git")).toBe(true);
      expect(
        resolve(import.meta.dir, "../../packages/db").endsWith("packages/db"),
      ).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
