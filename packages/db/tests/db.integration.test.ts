import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  closeDb,
  createConnection,
  createDb,
  createSqliteConnection,
  db,
  eq,
  getDb,
  lighthouseRuns,
  resetDb,
  runMigrations,
  systemMetadata,
} from "../src";

describe("SQLite Connection & Concurrency PRAGMAs", () => {
  it("initializes an in-memory connection with correct PRAGMAs", () => {
    const conn = createSqliteConnection(":memory:");
    try {
      const busyTimeout = conn.query("PRAGMA busy_timeout;").get() as {
        timeout: number;
      };
      expect(busyTimeout.timeout).toBe(5000);

      const foreignKeys = conn.query("PRAGMA foreign_keys;").get() as {
        foreign_keys: number;
      };
      expect(foreignKeys.foreign_keys).toBe(1);

      const synchronous = conn.query("PRAGMA synchronous;").get() as {
        synchronous: number;
      };
      expect(synchronous.synchronous).toBe(1); // 1 = NORMAL
    } finally {
      conn.close();
    }
  });

  it("enables WAL mode on file-backed connections", () => {
    const tempDbPath = join(tmpdir(), `test-wal-${Date.now()}.db`);
    try {
      const conn = createSqliteConnection(tempDbPath);
      try {
        const journalMode = conn.query("PRAGMA journal_mode;").get() as {
          journal_mode: string;
        };
        expect(journalMode.journal_mode.toLowerCase()).toBe("wal");
      } finally {
        conn.close();
      }
    } finally {
      rmSync(tempDbPath, { force: true });
      rmSync(`${tempDbPath}-wal`, { force: true });
      rmSync(`${tempDbPath}-shm`, { force: true });
    }
  });
});

describe("Migrations & Database Client Operations", () => {
  it("applies migrations programmatically and performs CRUD operations", async () => {
    const testDb = createDb({ path: ":memory:" });

    // Run programmatic migrations
    runMigrations(testDb);

    // Verify system_metadata table created and works
    const now = new Date();
    testDb
      .insert(systemMetadata)
      .values({
        key: "version",
        value: "1.0.0",
        updatedAt: now,
      })
      .run();

    // Verify query via await
    const result = await testDb.query.systemMetadata.findFirst({
      where: eq(systemMetadata.key, "version"),
    });

    expect(result).toBeDefined();
    expect(result?.key).toBe("version");
    expect(result?.value).toBe("1.0.0");
    expect(result?.updatedAt instanceof Date).toBe(true);

    // Verify query via .sync()
    const syncResult = testDb.query.systemMetadata
      .findFirst({
        where: eq(systemMetadata.key, "version"),
      })
      .sync();
    expect(syncResult?.value).toBe("1.0.0");

    // Update
    testDb
      .update(systemMetadata)
      .set({ value: "2.0.0" })
      .where(eq(systemMetadata.key, "version"))
      .run();

    const updated = await testDb.query.systemMetadata.findFirst({
      where: eq(systemMetadata.key, "version"),
    });
    expect(updated?.value).toBe("2.0.0");

    // Delete
    testDb
      .delete(systemMetadata)
      .where(eq(systemMetadata.key, "version"))
      .run();

    const deleted = await testDb.query.systemMetadata.findFirst({
      where: eq(systemMetadata.key, "version"),
    });
    expect(deleted).toBeUndefined();

    // Verify lighthouse_runs table and default timestamp $defaultFn
    testDb
      .insert(lighthouseRuns)
      .values({
        id: "run-default-ts",
        url: "https://example.com",
        finalUrl: "https://example.com/",
        formFactor: "mobile",
        throttlingMethod: "simulate",
        performanceScore: 95,
        accessibilityScore: 100,
        bestPracticesScore: 92,
        seoScore: 98,
        lcpMs: 1200.5,
        cls: 0.01,
        tbtMs: 45,
        fcpMs: 800,
        siMs: 1100,
        ttfbMs: 120,
        summaryJson: {
          lcpElement: null,
          lcpPhases: null,
          clsCulprits: [],
          insights: [],
          failedAudits: [],
          runWarnings: [],
          runtimeError: null,
          medianMetadata: null,
        },
        jsonReportPath: "/tmp/report.json",
        htmlReportPath: "/tmp/report.html",
        durationMs: 3200,
      })
      .run();

    const lhRow = await testDb.query.lighthouseRuns.findFirst({
      where: eq(lighthouseRuns.id, "run-default-ts"),
    });
    expect(lhRow?.url).toBe("https://example.com");
    expect(lhRow?.createdAt instanceof Date).toBe(true);
  });

  it("supports getDb() singleton, closeDb(), and resetDb()", () => {
    resetDb();
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
    closeDb();
    const db3 = getDb();
    expect(db3).not.toBe(db1);
    resetDb();
  });

  it("createConnection alias works identically to createSqliteConnection", () => {
    const conn = createConnection({ path: ":memory:" });
    expect(conn).toBeDefined();
    conn.close();
  });

  it("proxies db export dynamically and re-instantiates cleanly after resetDb()", () => {
    resetDb();
    const firstInstance = getDb();
    // Access property on db proxy
    expect(db.query).toBeDefined();
    // Reset db clears singleton
    resetDb();
    const secondInstance = getDb();
    expect(firstInstance).not.toBe(secondInstance);
    // db proxy continues to work against the new instance without throwing
    expect(db.query).toBeDefined();
    resetDb();
  });

  it("applies migrations idempotently when called multiple times", () => {
    const testDb = createDb({ path: ":memory:" });
    expect(() => runMigrations(testDb)).not.toThrow();
    expect(() => runMigrations(testDb)).not.toThrow();

    const rows = testDb.select().from(systemMetadata).all();
    expect(Array.isArray(rows)).toBe(true);
  });

  it("rolls back all writes atomically when a transaction throws mid-flight", () => {
    const testDb = createDb({ path: ":memory:" });
    runMigrations(testDb);

    expect(() => {
      testDb.transaction((tx) => {
        tx.insert(systemMetadata)
          .values({ key: "atomic_test", value: "v1", updatedAt: new Date() })
          .run();
        throw new Error("Mid-flight abort");
      });
    }).toThrow("Mid-flight abort");

    const found = testDb
      .select()
      .from(systemMetadata)
      .where(eq(systemMetadata.key, "atomic_test"))
      .all();
    expect(found).toHaveLength(0);
  });

  it("re-initializes connection when getDb is called with a different path", () => {
    resetDb();
    const db1 = getDb({ path: ":memory:" });
    runMigrations(db1);
    db1
      .insert(systemMetadata)
      .values({ key: "db1_key", value: "db1_val", updatedAt: new Date() })
      .run();

    const tempPath2 = join(tmpdir(), `test-switch-${Date.now()}.db`);
    try {
      const db2 = getDb({ path: tempPath2 });
      expect(db2).not.toBe(db1);
      runMigrations(db2);

      const foundInDb2 = db2
        .select()
        .from(systemMetadata)
        .where(eq(systemMetadata.key, "db1_key"))
        .all();
      expect(foundInDb2).toHaveLength(0);
    } finally {
      resetDb();
      rmSync(tempPath2, { force: true });
      rmSync(`${tempPath2}-wal`, { force: true });
      rmSync(`${tempPath2}-shm`, { force: true });
    }
  });

  it("applies embedded migrations matching packages/db/drizzle journal and SQL files on disk", () => {
    const drizzleDir = resolve(import.meta.dir, "../drizzle");
    const diskJournal = JSON.parse(
      readFileSync(join(drizzleDir, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string; when: number }> };

    const expectedApplied = diskJournal.entries.map((entry) => {
      const rawSql = readFileSync(join(drizzleDir, `${entry.tag}.sql`), "utf8");
      return {
        hash: createHash("sha256").update(rawSql).digest("hex"),
        createdAt: entry.when,
      };
    });

    const embeddedConn = createSqliteConnection(":memory:");
    const diskConn = createSqliteConnection(":memory:");
    try {
      const embeddedDb = createDb({ connection: embeddedConn });
      const diskDb = createDb({ connection: diskConn });

      runMigrations(embeddedDb);
      runMigrations(diskDb, { migrationsFolder: drizzleDir });

      const embeddedRows = embeddedConn
        .query(
          "SELECT hash, created_at FROM __devtools_migrations ORDER BY created_at ASC",
        )
        .all() as Array<{ hash: string; created_at: number }>;
      const diskRows = diskConn
        .query(
          "SELECT hash, created_at FROM __devtools_migrations ORDER BY created_at ASC",
        )
        .all() as Array<{ hash: string; created_at: number }>;

      expect(embeddedRows).toEqual(
        expectedApplied.map((e) => ({ hash: e.hash, created_at: e.createdAt })),
      );
      expect(embeddedRows).toEqual(diskRows);
    } finally {
      embeddedConn.close();
      diskConn.close();
    }
  });

  it("applies only pending embedded migrations incrementally and honors custom migrationsTable", () => {
    const drizzleDir = resolve(import.meta.dir, "../drizzle");
    const diskJournal = JSON.parse(
      readFileSync(join(drizzleDir, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string; when: number }> };
    const firstEntry = diskJournal.entries[0]!;
    const firstSql = readFileSync(
      join(drizzleDir, `${firstEntry.tag}.sql`),
      "utf8",
    );
    const firstHash = createHash("sha256").update(firstSql).digest("hex");

    const conn = createSqliteConnection(":memory:");
    try {
      conn.run(firstSql);
      conn.run(`
        CREATE TABLE "__custom_migrations" (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at numeric
        );
      `);
      conn
        .query(
          'INSERT INTO "__custom_migrations" ("hash", "created_at") VALUES (?, ?)',
        )
        .run(firstHash, firstEntry.when);

      const testDb = createDb({ connection: conn });
      runMigrations(testDb, { migrationsTable: "__custom_migrations" });

      const applied = conn
        .query(
          'SELECT created_at FROM "__custom_migrations" ORDER BY created_at ASC',
        )
        .all() as Array<{ created_at: number }>;
      expect(applied).toHaveLength(diskJournal.entries.length);
      expect(
        conn
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lighthouse_runs'",
          )
          .get(),
      ).toEqual({ name: "lighthouse_runs" });
    } finally {
      conn.close();
    }
  });

  it("delegates to drizzle-orm/bun-sqlite/migrator when custom migrationsFolder is provided", () => {
    const tmpFolder = mkdtempSync(join(tmpdir(), "devtools-custom-mig-"));
    const conn = createSqliteConnection(":memory:");
    try {
      mkdirSync(join(tmpFolder, "meta"), { recursive: true });
      writeFileSync(
        join(tmpFolder, "meta/_journal.json"),
        JSON.stringify({
          version: "7",
          dialect: "sqlite",
          entries: [
            {
              idx: 0,
              version: "6",
              when: 1700000000000,
              tag: "0000_custom",
              breakpoints: true,
            },
          ],
        }),
      );
      const customSql =
        "CREATE TABLE `custom_probe` (`id` text PRIMARY KEY NOT NULL);";
      writeFileSync(join(tmpFolder, "0000_custom.sql"), customSql);

      const testDb = createDb({ connection: conn });
      runMigrations(testDb, {
        migrationsFolder: tmpFolder,
        migrationsTable: "__custom_folder_migrations",
      });

      expect(
        conn
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'custom_probe'",
          )
          .get(),
      ).toEqual({ name: "custom_probe" });

      const expectedHash = createHash("sha256").update(customSql).digest("hex");
      const trackingRows = conn
        .query(
          'SELECT hash, created_at FROM "__custom_folder_migrations" ORDER BY created_at ASC',
        )
        .all() as Array<{ hash: string; created_at: number }>;
      expect(trackingRows).toEqual([
        { hash: expectedHash, created_at: 1700000000000 },
      ]);

      expect(
        conn
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('__devtools_migrations', '__drizzle_migrations')",
          )
          .all(),
      ).toEqual([]);
    } finally {
      conn.close();
      rmSync(tmpFolder, { recursive: true, force: true });
    }
  });

  it("rejects empty or whitespace migrationsFolder instead of falling back to embedded migrations", () => {
    for (const invalidFolder of ["", "   "]) {
      const conn = createSqliteConnection(":memory:");
      try {
        const testDb = createDb({ connection: conn });

        expect(() =>
          runMigrations(testDb, { migrationsFolder: invalidFolder }),
        ).toThrow("migrationsFolder must be a non-empty directory path");

        expect(
          conn
            .query(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'system_metadata'",
            )
            .get(),
        ).toBeNull();
      } finally {
        conn.close();
      }
    }
  });
});
