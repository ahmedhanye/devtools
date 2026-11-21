import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  asc,
  eq,
  lighthouseRuns,
  openDb,
  sql,
  systemMetadata,
  type DbSession,
} from "../src";
import {
  initializeBaselineSchema,
  resolveEmbeddedMigrations,
} from "../src/migrator";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

describe("openDb Lifecycle, DbSession/DbHandle Split, Idle-Close, Migrations & Concurrency", () => {
  it("is strictly lazy until first access and leaves zero disk artifacts if closed unused", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-lazy-"));
    const dbPath = join(tmpDir, "nested", "lazy.db");

    try {
      const handle = openDb({ path: dbPath });
      const session: DbSession = handle;
      expect(session.path).toBe(dbPath);
      expect(existsSync(join(tmpDir, "nested"))).toBe(false);
      expect(existsSync(dbPath)).toBe(false);

      handle.close();
      expect(existsSync(join(tmpDir, "nested"))).toBe(false);
      expect(existsSync(dbPath)).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("validates busyTimeoutMs and idleTimeoutMs options", () => {
    expect(() => openDb({ memory: true, busyTimeoutMs: -1 })).toThrow(
      RangeError,
    );
    expect(() => openDb({ memory: true, busyTimeoutMs: 1.5 })).toThrow(
      RangeError,
    );
    expect(() => openDb({ memory: true, idleTimeoutMs: -10 })).toThrow(
      RangeError,
    );
    expect(() => openDb({ memory: true, idleTimeoutMs: 2.5 })).toThrow(
      RangeError,
    );
  });

  it("configures SQLite WAL & integrity PRAGMAs, populates non-null autoincrement IDs, and cleans up WAL files on close", () => {
    const drizzleDir = resolve(PACKAGE_ROOT, "drizzle");
    const diskJournal = JSON.parse(
      readFileSync(join(drizzleDir, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string; when: number }> };
    const expectedApplied = diskJournal.entries.map((entry, idx) => {
      const rawSql = readFileSync(join(drizzleDir, `${entry.tag}.sql`), "utf8");
      return {
        id: idx + 1,
        hash: createHash("sha256").update(rawSql).digest("hex"),
        created_at: entry.when,
      };
    });

    const mem = openDb({ memory: true });
    mem.ensureReady();
    const memChecks = mem.read((db) => ({
      busy: db.all<{ timeout: number }>(sql`PRAGMA busy_timeout;`)[0],
      fk: db.all<{ foreign_keys: number }>(sql`PRAGMA foreign_keys;`)[0],
      migrations: db.all<{
        id: number | null;
        hash: string;
        created_at: number;
      }>(
        sql`SELECT id, hash, created_at FROM __devtools_migrations ORDER BY id ASC`,
      ),
    }));
    expect(memChecks.busy?.timeout).toBe(5000);
    expect(memChecks.fk?.foreign_keys).toBe(1);
    expect(memChecks.migrations).toEqual(expectedApplied);
    mem.close();

    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-wal-"));
    const fileDbPath = join(tmpDir, "wal.db");
    try {
      {
        using fileDb = openDb({ path: fileDbPath, idleTimeoutMs: 0 });
        fileDb.ensureReady();
        fileDb.ensureReady();
        fileDb.write((tx) => {
          tx.insert(systemMetadata)
            .values({ key: "wal_key", value: "v1", updatedAt: new Date() })
            .run();
        });
        const filePragmas = fileDb.read((db) => ({
          mode: db.all<{ journal_mode: string }>(sql`PRAGMA journal_mode;`)[0],
          sync: db.all<{ synchronous: number }>(sql`PRAGMA synchronous;`)[0],
        }));
        expect(filePragmas.mode?.journal_mode.toLowerCase()).toBe("wal");
        expect(filePragmas.sync?.synchronous).toBe(1);
      }

      // Native sqlite.close(true) checkpoints and unlinks -wal and -shm on last close
      expect(existsSync(`${fileDbPath}-wal`)).toBe(false);
      expect(existsSync(`${fileDbPath}-shm`)).toBe(false);

      using reopened = openDb({ path: fileDbPath });
      const tables = reopened.read((db) =>
        db.all<{ name: string }>(
          sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('system_metadata', 'lighthouse_runs') ORDER BY name ASC`,
        ),
      );
      expect(tables).toEqual([
        { name: "lighthouse_runs" },
        { name: "system_metadata" },
      ]);
      const row = reopened.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "wal_key"))
          .get(),
      );
      expect(row?.value).toBe("v1");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("upgrades pending and out-of-order migrations by applied hash, skips up-to-date DBs without write locks, and ignores foreign DBs", () => {
    const drizzleDir = resolve(PACKAGE_ROOT, "drizzle");
    const diskJournal = JSON.parse(
      readFileSync(join(drizzleDir, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string; when: number }> };
    const firstEntry = diskJournal.entries[0]!;
    const firstSql = readFileSync(
      join(drizzleDir, `${firstEntry.tag}.sql`),
      "utf8",
    );
    const firstHash = createHash("sha256").update(firstSql).digest("hex");

    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-upgrade-"));
    const upgradeDbPath = join(tmpDir, "v0-only.db");
    const foreignDbPath = join(tmpDir, "foreign.db");

    try {
      // 1. Seed a legacy DB that only applied 0000_init
      const rawUpgrade = new Database(upgradeDbPath, { create: true });
      try {
        rawUpgrade.run(`
          CREATE TABLE "__devtools_migrations" (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at numeric
          )
        `);
        rawUpgrade.run(firstSql);
        rawUpgrade
          .query(
            `INSERT INTO "__devtools_migrations" ("hash", "created_at") VALUES (?, ?)`,
          )
          .run(firstHash, firstEntry.when);
        rawUpgrade
          .query(
            `INSERT INTO "system_metadata" ("key", "value", "updated_at") VALUES (?, ?, ?)`,
          )
          .run("legacy_key", "preserved", Date.now());
      } finally {
        rawUpgrade.close(true);
      }

      using upgraded = openDb({ path: upgradeDbPath });
      const legacyRow = upgraded.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "legacy_key"))
          .get(),
      );
      expect(legacyRow?.value).toBe("preserved");

      upgraded.write((tx) => {
        tx.insert(lighthouseRuns)
          .values({
            id: "upgrade-run-1",
            url: "https://example.com",
            finalUrl: "https://example.com/",
            formFactor: "mobile",
            throttlingMethod: "simulate",
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
            jsonReportPath: "/tmp/upgrade/report.json",
            htmlReportPath: "/tmp/upgrade/report.html",
            durationMs: 1200,
            createdAt: new Date("2026-11-20T00:00:00Z"),
          })
          .run();
      });

      // Tolerant summary_json read seam returns null for raw syntactically corrupt or non-object JSON
      upgraded.write((tx) => {
        tx.run(sql`
          INSERT INTO lighthouse_runs (
            id, url, final_url, form_factor, throttling_method,
            summary_json, json_report_path, html_report_path, duration_ms, created_at
          ) VALUES
            ('corrupt-raw-json', 'https://example.com', 'https://example.com/', 'mobile', 'simulate', '{not-valid-json', '/tmp/c/r.json', '/tmp/c/r.html', 1000, 1793304000001),
            ('non-object-json', 'https://example.com', 'https://example.com/', 'mobile', 'simulate', '"bad-json"', '/tmp/n/r.json', '/tmp/n/r.html', 1000, 1793304000002)
        `);
      });
      const tolerantRows = upgraded.read((db) =>
        db
          .select({
            id: lighthouseRuns.id,
            summaryJson: lighthouseRuns.summaryJson,
          })
          .from(lighthouseRuns)
          .orderBy(asc(lighthouseRuns.id))
          .all(),
      );
      expect(tolerantRows).toEqual([
        { id: "corrupt-raw-json", summaryJson: null },
        { id: "non-object-json", summaryJson: null },
        {
          id: "upgrade-run-1",
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
        },
      ]);

      const appliedMigrations = upgraded.read((db) =>
        db.all<{ hash: string; created_at: number }>(
          sql`SELECT hash, created_at FROM __devtools_migrations ORDER BY created_at ASC`,
        ),
      );
      expect(appliedMigrations).toHaveLength(diskJournal.entries.length);
      expect(appliedMigrations.map((m) => m.created_at)).toEqual(
        diskJournal.entries.map((e) => e.when),
      );
      upgraded.close();

      // 2. Re-opening an already up-to-date DB succeeds via read-only hash check without taking a write lock
      const externalWriter = new Database(upgradeDbPath);
      externalWriter.run("BEGIN IMMEDIATE;");
      try {
        using upToDate = openDb({
          path: upgradeDbPath,
          busyTimeoutMs: 5,
        });
        const rechecked = upToDate.read((db) =>
          db.all<{ count: number }>(
            sql`SELECT count(*) as count FROM __devtools_migrations`,
          ),
        );
        expect(rechecked[0]?.count).toBe(diskJournal.entries.length);
      } finally {
        externalWriter.run("ROLLBACK;");
        externalWriter.close(true);
      }

      // 3. Foreign DB with user tables and no __devtools_migrations table is left untouched
      const rawForeign = new Database(foreignDbPath, { create: true });
      try {
        rawForeign.run(
          "CREATE TABLE unrelated_items (id TEXT PRIMARY KEY, label TEXT NOT NULL);",
        );
        rawForeign.run(
          "INSERT INTO unrelated_items (id, label) VALUES ('f1', 'keep');",
        );
      } finally {
        rawForeign.close(true);
      }

      using foreignHandle = openDb({ path: foreignDbPath });
      const foreignTables = foreignHandle.read((db) =>
        db
          .all<{ name: string }>(
            sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`,
          )
          .map((t) => t.name),
      );
      expect(foreignTables).toEqual(["unrelated_items"]);

      // 4. Out-of-order branch merge migration (earlier `when` timestamp than already-applied migration)
      const outOfOrderDb = new Database(":memory:", { create: true });
      try {
        const laterOnly = resolveEmbeddedMigrations(
          [{ tag: "m_later", when: 2000 }],
          {
            m_later: "CREATE TABLE t_later (id INTEGER PRIMARY KEY);",
          },
        );
        initializeBaselineSchema(outOfOrderDb, laterOnly);

        const bothMigrations = resolveEmbeddedMigrations(
          [
            { tag: "m_earlier", when: 1000 },
            { tag: "m_later", when: 2000 },
          ],
          {
            m_earlier: "CREATE TABLE t_earlier (id INTEGER PRIMARY KEY);",
            m_later: "CREATE TABLE t_later (id INTEGER PRIMARY KEY);",
          },
        );
        initializeBaselineSchema(outOfOrderDb, bothMigrations);

        const tablesInMem = outOfOrderDb
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('t_earlier', 't_later') ORDER BY name ASC",
          )
          .all()
          .map((row) => row.name);
        expect(tablesInMem).toEqual(["t_earlier", "t_later"]);
      } finally {
        outOfOrderDb.close(true);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("keeps :memory: handles isolated and disables idle-close for :memory:", async () => {
    using dbA = openDb({ memory: true, idleTimeoutMs: 10 });
    using dbB = openDb({ memory: true });

    dbA.write((tx) => {
      tx.insert(systemMetadata)
        .values({ key: "isolation", value: "alpha", updatedAt: new Date() })
        .run();
    });

    await Bun.sleep(35);

    const fromA = dbA.read((db) =>
      db
        .select()
        .from(systemMetadata)
        .where(eq(systemMetadata.key, "isolation"))
        .all(),
    );
    const fromB = dbB.read((db) =>
      db
        .select()
        .from(systemMetadata)
        .where(eq(systemMetadata.key, "isolation"))
        .all(),
    );

    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.value).toBe("alpha");
    expect(fromB).toHaveLength(0);
  });

  it("supports autoInit: false error boundary and independent concurrent handles to the same WAL file", () => {
    using mem = openDb({ memory: true, autoInit: false });
    mem.ensureReady();
    expect(() =>
      mem.read((db) => db.select().from(lighthouseRuns).all()),
    ).toThrow();

    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-autoinit-"));
    const dbPath = join(tmpDir, "shared.db");
    try {
      using noInitHandle = openDb({ path: dbPath, autoInit: false });
      noInitHandle.ensureReady();
      expect(() =>
        noInitHandle.read((db) => db.select().from(systemMetadata).all()),
      ).toThrow();

      using h1 = openDb({ path: dbPath, autoInit: true });
      using h2 = openDb({ path: dbPath, autoInit: true });

      h1.write((tx) => {
        tx.insert(systemMetadata)
          .values({ key: "shared_key", value: "shared", updatedAt: new Date() })
          .run();
      });

      const row = h2.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "shared_key"))
          .get(),
      );
      expect(row?.value).toBe("shared");

      // Closing h1 leaves h2 unaffected
      h1.close();
      h1.close(); // idempotent
      expect(() => h1.read(() => 1)).toThrow("Database handle is closed");
      expect(() => h1.ensureReady()).toThrow("Database handle is closed");
      expect(() => h1.write(() => 1)).toThrow("Database handle is closed");

      const stillReadable = h2.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "shared_key"))
          .get(),
      );
      expect(stillReadable?.value).toBe("shared");

      h2.close();
      expect(() => h2.read(() => 1)).toThrow("Database handle is closed");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rolls back write() transactions atomically, shares tx for nested read(), and supports nested SAVEPOINTs", () => {
    using handle = openDb({ memory: true });

    expect(() =>
      handle.write((tx) => {
        tx.insert(systemMetadata)
          .values({ key: "outer_fail", value: "1", updatedAt: new Date() })
          .run();
        throw new Error("Outer abort");
      }),
    ).toThrow("Outer abort");

    expect(
      handle.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "outer_fail"))
          .all(),
      ),
    ).toHaveLength(0);

    handle.write((tx) => {
      tx.insert(systemMetadata)
        .values({ key: "outer_keep", value: "kept", updatedAt: new Date() })
        .run();

      const seenInsideTx = handle.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "outer_keep"))
          .get(),
      );
      expect(seenInsideTx?.value).toBe("kept");

      expect(() =>
        handle.write((nestedTx) => {
          nestedTx
            .insert(systemMetadata)
            .values({
              key: "inner_rollback",
              value: "dropped",
              updatedAt: new Date(),
            })
            .run();
          throw new Error("Inner savepoint abort");
        }),
      ).toThrow("Inner savepoint abort");

      handle.write((nestedTx) => {
        nestedTx
          .insert(systemMetadata)
          .values({
            key: "inner_keep",
            value: "committed",
            updatedAt: new Date(),
          })
          .run();
      });
    });

    const keys = handle.read((db) =>
      db
        .select()
        .from(systemMetadata)
        .orderBy(asc(systemMetadata.key))
        .all()
        .map((r) => r.key),
    );
    expect(keys).toEqual(["inner_keep", "outer_keep"]);
  });

  it("cleans up opened connection cleanly when opening a corrupt non-SQLite file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-corrupt-"));
    const corruptPath = join(tmpDir, "corrupt.db");
    writeFileSync(corruptPath, "not-a-sqlite-database\n");

    try {
      const handle = openDb({ path: corruptPath });
      expect(() => handle.ensureReady()).toThrow();
      handle.close();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("idle-closes file-backed handles cleanly, deletes WAL sidecars, self-heals on DB deletion, and ignores close when already idle-closed", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-idle-"));
    const dbPath = join(tmpDir, "idle.db");

    try {
      const handle = openDb({ path: dbPath, idleTimeoutMs: 25 });
      handle.write((tx) => {
        tx.insert(systemMetadata)
          .values({ key: "idle_1", value: "saved", updatedAt: new Date() })
          .run();
      });
      expect(existsSync(`${dbPath}-wal`)).toBe(true);
      expect(existsSync(`${dbPath}-shm`)).toBe(true);

      // Wait for idle-close to fire
      await Bun.sleep(75);
      expect(existsSync(`${dbPath}-wal`)).toBe(false);
      expect(existsSync(`${dbPath}-shm`)).toBe(false);

      // Transparently reopens and sees persisted data
      const row = handle.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "idle_1"))
          .get(),
      );
      expect(row?.value).toBe("saved");

      // Wait for idle-close again, delete DB files on disk, and verify self-healing reopen
      await Bun.sleep(75);
      rmSync(dbPath, { force: true });
      expect(existsSync(dbPath)).toBe(false);

      handle.write((tx) => {
        tx.insert(systemMetadata)
          .values({ key: "healed", value: "ok", updatedAt: new Date() })
          .run();
      });
      expect(existsSync(dbPath)).toBe(true);
      expect(
        handle.read((db) =>
          db
            .select()
            .from(systemMetadata)
            .where(eq(systemMetadata.key, "healed"))
            .get(),
        )?.value,
      ).toBe("ok");

      // Wait for idle-close, then explicit close() is a terminal 0ms no-op
      await Bun.sleep(75);
      handle.close();
      expect(() => handle.read(() => 1)).toThrow("Database handle is closed");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("does not stall idle-close or close() under external BEGIN EXCLUSIVE (busy_timeout=0 before optimize) and unrefs idle timer", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-nolockstall-"));
    const dbPath = join(tmpDir, "stall-check.db");

    const init = openDb({ path: dbPath, idleTimeoutMs: 0 });
    init.ensureReady();
    init.close();

    const lockerScript = `
      import { Database } from "bun:sqlite";
      const db = new Database(process.argv[1]);
      const holdMs = Number(process.argv[2]);
      db.run("BEGIN EXCLUSIVE;");
      process.stdout.write("LOCKED\\n");
      Bun.sleepSync(holdMs);
      db.run("COMMIT;");
      db.close();
    `;

    try {
      const proc = Bun.spawn(["bun", "-e", lockerScript, dbPath, "600"], {
        cwd: PACKAGE_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });
      const reader = proc.stdout.getReader();
      let text = "";
      while (!text.includes("LOCKED")) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += new TextDecoder().decode(chunk.value);
      }

      try {
        // With busyTimeoutMs = 5000, closing must NOT block for 5,000 ms (or 600 ms)
        const handle = openDb({
          path: dbPath,
          busyTimeoutMs: 5000,
          idleTimeoutMs: 0,
        });
        handle.ensureReady();
        const start = performance.now();
        handle.close();
        const elapsedMs = performance.now() - start;
        expect(elapsedMs).toBeLessThan(200);
      } finally {
        await proc.exited;
      }

      // Verify default 30s idle timer is .unref()'d and does not hang process exit
      const unrefScript = `
        import { openDb } from "./src/index.ts";
        const h = openDb({ path: process.argv[1] });
        h.ensureReady();
      `;
      const unrefStart = performance.now();
      const unrefProc = Bun.spawn(["bun", "-e", unrefScript, dbPath], {
        cwd: PACKAGE_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await unrefProc.exited;
      const unrefElapsed = performance.now() - unrefStart;
      expect(exitCode).toBe(0);
      expect(unrefElapsed).toBeLessThan(2000);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("coordinates concurrent multi-process cold-start schema auto-init and BEGIN IMMEDIATE writes via Bun.spawn", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-multiproc-"));
    const sharedDbPath = join(tmpDir, "concurrent.db");
    const workerCount = 6;

    const workerScript = `
      import { openDb, systemMetadata } from "./src/index.ts";
      const dbPath = process.argv[1];
      const workerId = process.argv[2];
      using handle = openDb({ path: dbPath });
      handle.write((tx) => {
        tx.insert(systemMetadata)
          .values({
            key: "worker-" + workerId,
            value: "pid-" + String(process.pid),
            updatedAt: new Date(),
          })
          .run();
      });
      const count = handle.read((db) => db.select().from(systemMetadata).all().length);
      if (count < 1) throw new Error("Expected committed row");
    `;

    try {
      const procs = Array.from({ length: workerCount }, (_, idx) =>
        Bun.spawn(["bun", "-e", workerScript, sharedDbPath, String(idx)], {
          cwd: PACKAGE_ROOT,
          stdout: "pipe",
          stderr: "pipe",
        }),
      );

      const results = await Promise.all(
        procs.map(async (proc) => ({
          exitCode: await proc.exited,
          stderr: await new Response(proc.stderr).text(),
        })),
      );

      for (const res of results) {
        expect(res.stderr).toBe("");
        expect(res.exitCode).toBe(0);
      }

      using verifier = openDb({ path: sharedDbPath });
      const rows = verifier.read((db) =>
        db.select().from(systemMetadata).all(),
      );
      expect(rows).toHaveLength(workerCount);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
