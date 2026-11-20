import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
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
  createShutdownCoordinator,
  type ShutdownRegistry,
} from "@devtools/core/node";
import {
  asc,
  closeAllDbs,
  eq,
  lighthouseRuns,
  openDb,
  sql,
  systemMetadata,
} from "../src";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

describe("Unified openDb Lifecycle, PRAGMAs, Pooling & Concurrency", () => {
  afterEach(() => {
    closeAllDbs();
  });

  it("is strictly lazy until first access and leaves zero disk artifacts if closed unused", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-lazy-"));
    const dbPath = join(tmpDir, "nested", "lazy.db");

    try {
      const handle = openDb({ path: dbPath });
      expect(handle.path).toBe(dbPath);
      expect(existsSync(join(tmpDir, "nested"))).toBe(false);
      expect(existsSync(dbPath)).toBe(false);

      handle.close();
      expect(existsSync(join(tmpDir, "nested"))).toBe(false);
      expect(existsSync(dbPath)).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("configures SQLite WAL & integrity PRAGMAs and applies embedded baseline schema matching drizzle artifacts", () => {
    const drizzleDir = resolve(PACKAGE_ROOT, "drizzle");
    const diskJournal = JSON.parse(
      readFileSync(join(drizzleDir, "meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string; when: number }> };
    const expectedApplied = diskJournal.entries.map((entry) => {
      const rawSql = readFileSync(join(drizzleDir, `${entry.tag}.sql`), "utf8");
      return {
        hash: createHash("sha256").update(rawSql).digest("hex"),
        created_at: entry.when,
      };
    });

    const mem = openDb({ memory: true });
    mem.ensureReady();
    const memChecks = mem.read((db) => ({
      busy: db.all<{ timeout: number }>(sql`PRAGMA busy_timeout;`)[0],
      fk: db.all<{ foreign_keys: number }>(sql`PRAGMA foreign_keys;`)[0],
      sync: db.all<{ synchronous: number }>(sql`PRAGMA synchronous;`)[0],
      migrations: db.all<{ hash: string; created_at: number }>(
        sql`SELECT hash, created_at FROM __devtools_migrations ORDER BY created_at ASC`,
      ),
    }));
    expect(memChecks.busy?.timeout).toBe(5000);
    expect(memChecks.fk?.foreign_keys).toBe(1);
    expect(memChecks.sync?.synchronous).toBe(1);
    expect(memChecks.migrations).toEqual(expectedApplied);
    mem.close();

    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-wal-"));
    const fileDbPath = join(tmpDir, "wal.db");
    try {
      {
        using fileDb = openDb({ path: fileDbPath });
        fileDb.ensureReady();
        // Idempotent second ensureReady()
        fileDb.ensureReady();
        const mode = fileDb.read(
          (db) =>
            db.all<{ journal_mode: string }>(sql`PRAGMA journal_mode;`)[0],
        );
        expect(mode?.journal_mode.toLowerCase()).toBe("wal");
      }

      // Re-opening an already-initialized file DB keeps existing schema & data
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
    } finally {
      closeAllDbs();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("upgrades an existing tracked DB with pending migrations, skips up-to-date DBs without write locks, and leaves foreign DBs untouched", () => {
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

      // Opening via openDb lazily applies pending 0001_brave_lilandra without touching legacy data
      const upgraded = openDb({ path: upgradeDbPath });
      const legacyRow = upgraded.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "legacy_key"))
          .get(),
      );
      expect(legacyRow?.value).toBe("preserved");

      // Newly applied lighthouse_runs table works for reads and writes
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
      const runs = upgraded.read((db) =>
        db.select().from(lighthouseRuns).all(),
      );
      expect(runs).toHaveLength(1);
      expect(runs[0]?.id).toBe("upgrade-run-1");

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

      // 2. Re-opening an already up-to-date DB succeeds via read-only watermark check without taking a write lock
      const externalWriter = new Database(upgradeDbPath);
      externalWriter.run("BEGIN IMMEDIATE;");
      try {
        const upToDate = openDb({
          path: upgradeDbPath,
          busyTimeoutMs: 5,
          maxBusyRetries: 0,
        });
        const rechecked = upToDate.read((db) =>
          db.all<{ count: number }>(
            sql`SELECT count(*) as count FROM __devtools_migrations`,
          ),
        );
        expect(rechecked[0]?.count).toBe(diskJournal.entries.length);
        upToDate.close();
      } finally {
        externalWriter.run("ROLLBACK;");
        externalWriter.close(true);
      }

      // 3. Foreign DB with user tables and no __devtools_migrations table is left completely untouched
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

      const foreignHandle = openDb({ path: foreignDbPath });
      const foreignTables = foreignHandle.read((db) =>
        db
          .all<{ name: string }>(
            sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC`,
          )
          .map((t) => t.name),
      );
      expect(foreignTables).toEqual(["unrelated_items"]);
      foreignHandle.close();
    } finally {
      closeAllDbs();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("keeps :memory: handles isolated across concurrent openDb calls", () => {
    using dbA = openDb({ memory: true });
    using dbB = openDb({ memory: true });

    dbA.write((tx) => {
      tx.insert(systemMetadata)
        .values({ key: "isolation", value: "alpha", updatedAt: new Date() })
        .run();
    });

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

  it("supports autoInit: false error boundary and later upgrades via pooled autoInit: true handle", () => {
    const mem = openDb({ memory: true, autoInit: false });
    mem.ensureReady();
    expect(() =>
      mem.read((db) => db.select().from(lighthouseRuns).all()),
    ).toThrow();
    mem.close();

    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-autoinit-"));
    const dbPath = join(tmpDir, "uninit.db");
    try {
      const noInitHandle = openDb({ path: dbPath, autoInit: false });
      noInitHandle.ensureReady();
      expect(() =>
        noInitHandle.read((db) => db.select().from(systemMetadata).all()),
      ).toThrow();

      // Re-calling ensureReady on same handle with autoInit: false still does not initialize
      noInitHandle.ensureReady();

      const initHandle = openDb({ path: dbPath, autoInit: true });
      initHandle.ensureReady();
      expect(
        noInitHandle.read((db) => db.select().from(systemMetadata).all()),
      ).toEqual([]);

      noInitHandle.close();
      initHandle.close();
    } finally {
      closeAllDbs();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("pools file-backed connections by canonical path with lease ref-counting and rejects use-after-close", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-pool-"));
    const dbPath = join(tmpDir, "pooled.db");

    try {
      const h1 = openDb({ path: dbPath });
      const h2 = openDb({ path: dbPath });

      h1.write((tx) => {
        tx.insert(systemMetadata)
          .values({ key: "pool_key", value: "shared", updatedAt: new Date() })
          .run();
      });

      // h2 joins the open pool and sees committed data immediately
      const row = h2.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "pool_key"))
          .get(),
      );
      expect(row?.value).toBe("shared");

      // Closing h1 decrements lease refCount while h2 stays open
      h1.close();
      h1.close(); // idempotent
      expect(() => h1.read(() => 1)).toThrow("Database handle is closed");
      expect(() => h1.ensureReady()).toThrow("Database handle is closed");
      expect(() => h1.write(() => 1)).toThrow("Database handle is closed");

      const stillReadable = h2.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "pool_key"))
          .get(),
      );
      expect(stillReadable?.value).toBe("shared");

      // Closing final lease closes underlying SQLite and checkpoints WAL
      h2.close();
      expect(() => h2.read(() => 1)).toThrow("Database handle is closed");
    } finally {
      closeAllDbs();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rolls back write() transactions atomically and supports nested SAVEPOINTs", () => {
    using handle = openDb({ memory: true });

    // Outer rollback
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

    // Nested SAVEPOINT rollback caught inside outer write() preserves outer insert
    handle.write((tx) => {
      tx.insert(systemMetadata)
        .values({ key: "outer_keep", value: "kept", updatedAt: new Date() })
        .run();

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

      // Successful nested write commits cleanly
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
      closeAllDbs();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("self-registers Phase 3 persistence cleanup onto ShutdownCoordinator and executes last", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-shutdown-"));
    const dbPath = join(tmpDir, "shutdown.db");
    const coordinator = createShutdownCoordinator();
    const order: string[] = [];

    try {
      const dbHandle = openDb({ path: dbPath, shutdown: coordinator });
      const memHandle = openDb({ memory: true, shutdown: coordinator });
      dbHandle.ensureReady();
      memHandle.ensureReady();

      // Calling ensureReady again re-uses the existing shutdown hook registration
      dbHandle.ensureReady();

      coordinator.register("ingress", () => {
        order.push("ingress");
      });
      coordinator.register("work", () => {
        // DB must still be usable during ingress and work phases
        dbHandle.write((tx) => {
          tx.insert(systemMetadata)
            .values({ key: "during_work", value: "ok", updatedAt: new Date() })
            .run();
        });
        order.push("work");
      });

      await coordinator.shutdown("SIGTERM");
      order.push("after-shutdown");

      expect(order).toEqual(["ingress", "work", "after-shutdown"]);
      expect(() => dbHandle.read(() => 1)).toThrow("Database handle is closed");
      expect(() => memHandle.read(() => 1)).toThrow(
        "Database handle is closed",
      );

      // Closing handle after Phase 3 already closed it is a safe no-op
      dbHandle.close();
      memHandle.close();
    } finally {
      closeAllDbs();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("scopes Phase 3 persistence leases per ShutdownCoordinator on a shared file-backed DB", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-multi-coord-"));
    const dbPath = join(tmpDir, "shared.db");

    try {
      // Case 1: Handle A left open for Phase 3 persistence on coordinatorA while coordinatorB stays active
      const coordA = createShutdownCoordinator();
      const coordB = createShutdownCoordinator();
      const handleA = openDb({ path: dbPath, shutdown: coordA });
      const handleB = openDb({ path: dbPath, shutdown: coordB });

      handleA.write((tx) => {
        tx.insert(systemMetadata)
          .values({ key: "from_a", value: "alive", updatedAt: new Date() })
          .run();
      });
      handleB.ensureReady();

      await coordA.shutdown("SIGTERM");

      expect(() => handleA.read(() => 1)).toThrow("Database handle is closed");

      // Coordinator B's handle remains fully usable for reads and writes
      const fromA = handleB.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "from_a"))
          .get(),
      );
      expect(fromA?.value).toBe("alive");

      handleB.write((tx) => {
        tx.insert(systemMetadata)
          .values({
            key: "from_b_after_a",
            value: "still-open",
            updatedAt: new Date(),
          })
          .run();
      });

      await coordB.shutdown("SIGTERM");
      expect(() => handleB.read(() => 1)).toThrow("Database handle is closed");

      // Case 2: Handle C closed manually during work phase before coordC shuts down while handleD stays active
      const coordC = createShutdownCoordinator();
      const coordD = createShutdownCoordinator();
      const handleC = openDb({ path: dbPath, shutdown: coordC });
      const handleD = openDb({ path: dbPath, shutdown: coordD });

      handleC.ensureReady();
      handleD.ensureReady();

      coordC.register("work", () => {
        handleC.close();
      });

      await coordC.shutdown("SIGTERM");
      expect(() => handleC.read(() => 1)).toThrow("Database handle is closed");

      const persisted = handleD.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "from_b_after_a"))
          .get(),
      );
      expect(persisted?.value).toBe("still-open");

      handleD.write((tx) => {
        tx.insert(systemMetadata)
          .values({
            key: "from_d_after_c",
            value: "ok",
            updatedAt: new Date(),
          })
          .run();
      });

      await coordD.shutdown("SIGTERM");
      expect(() => handleD.read(() => 1)).toThrow("Database handle is closed");

      // Case 3: Two handles under the SAME coordinator — closing one manually keeps the other active until shutdown
      const sharedCoord = createShutdownCoordinator();
      const h1 = openDb({ path: dbPath, shutdown: sharedCoord });
      const h2 = openDb({ path: dbPath, shutdown: sharedCoord });

      h1.ensureReady();
      h2.ensureReady();
      h1.close();
      expect(() => h1.read(() => 1)).toThrow("Database handle is closed");

      const stillUp = h2.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "from_d_after_c"))
          .get(),
      );
      expect(stillUp?.value).toBe("ok");

      await sharedCoord.shutdown("SIGTERM");
      expect(() => h2.read(() => 1)).toThrow("Database handle is closed");

      // Case 4: Manually closing a registry's last lease unregisters its hook while a sibling keeps the DB open,
      // and opening a second handle on that same coordinator re-registers cleanly before shutdown
      const coordE = createShutdownCoordinator();
      const coordF = createShutdownCoordinator();
      let registerCalls = 0;
      let unregisterCalls = 0;
      const spyRegistry: ShutdownRegistry = {
        get signal() {
          return coordE.signal;
        },
        get isShuttingDown() {
          return coordE.isShuttingDown;
        },
        register(phase, hook, options) {
          registerCalls += 1;
          const unregister = coordE.register(phase, hook, options);
          return () => {
            unregisterCalls += 1;
            unregister();
          };
        },
      };

      const handleE1 = openDb({ path: dbPath, shutdown: spyRegistry });
      const handleF = openDb({ path: dbPath, shutdown: coordF });

      handleE1.ensureReady();
      handleF.ensureReady();
      expect(registerCalls).toBe(1);
      expect(unregisterCalls).toBe(0);

      handleE1.close();
      expect(() => handleE1.read(() => 1)).toThrow("Database handle is closed");
      expect(unregisterCalls).toBe(1);

      const handleE2 = openDb({ path: dbPath, shutdown: spyRegistry });
      handleE2.ensureReady();
      expect(registerCalls).toBe(2);

      await coordE.shutdown("SIGTERM");
      expect(() => handleE2.read(() => 1)).toThrow("Database handle is closed");
      expect(unregisterCalls).toBe(2);

      const fAfterE = handleF.read((db) =>
        db
          .select()
          .from(systemMetadata)
          .where(eq(systemMetadata.key, "from_d_after_c"))
          .get(),
      );
      expect(fAfterE?.value).toBe("ok");

      await coordF.shutdown("SIGTERM");
      expect(() => handleF.read(() => 1)).toThrow("Database handle is closed");
    } finally {
      closeAllDbs();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("avoids leaking refCount or skipping shutdown hook registration when pooled autoInit upgrade fails with SQLITE_BUSY", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-pooled-busy-"));
    const retryPath = join(tmpDir, "retry.db");
    const abandonPath = join(tmpDir, "abandon.db");

    try {
      // Retry path: pooled autoInit: true upgrade fails under BEGIN EXCLUSIVE, then retries cleanly and honors shutdown
      const retryCoord1 = createShutdownCoordinator();
      const retryCoord2 = createShutdownCoordinator();
      const h1 = openDb({
        path: retryPath,
        autoInit: false,
        shutdown: retryCoord1,
        busyTimeoutMs: 5,
        maxBusyRetries: 0,
      });
      h1.ensureReady();

      const retryLocker = new Database(retryPath);
      retryLocker.run("BEGIN EXCLUSIVE;");
      const h2 = openDb({
        path: retryPath,
        autoInit: true,
        shutdown: retryCoord2,
        busyTimeoutMs: 5,
        maxBusyRetries: 0,
      });
      try {
        expect(() => h2.ensureReady()).toThrow(
          /database is locked|SQLITE_BUSY/i,
        );
      } finally {
        retryLocker.run("COMMIT;");
        retryLocker.close();
      }

      // Retrying after lock release applies migrations and registers h2's shutdown lease
      h2.ensureReady();
      h2.write((tx) => {
        tx.insert(systemMetadata)
          .values({ key: "retry_ok", value: "yes", updatedAt: new Date() })
          .run();
      });

      await retryCoord1.shutdown("SIGTERM");
      expect(() => h1.read(() => 1)).toThrow("Database handle is closed");
      expect(
        h2.read((db) =>
          db
            .select()
            .from(systemMetadata)
            .where(eq(systemMetadata.key, "retry_ok"))
            .get(),
        )?.value,
      ).toBe("yes");

      await retryCoord2.shutdown("SIGTERM");
      expect(() => h2.read(() => 1)).toThrow("Database handle is closed");

      // Abandon path: failed pooled autoInit: true upgrade leaves zero leaked refCount on the pooled connection
      const abandonCoord1 = createShutdownCoordinator();
      const abandonCoord2 = createShutdownCoordinator();
      const a1 = openDb({
        path: abandonPath,
        autoInit: false,
        shutdown: abandonCoord1,
        busyTimeoutMs: 5,
        maxBusyRetries: 0,
      });
      a1.ensureReady();

      const abandonLocker = new Database(abandonPath);
      abandonLocker.run("BEGIN EXCLUSIVE;");
      const a2 = openDb({
        path: abandonPath,
        autoInit: true,
        shutdown: abandonCoord2,
        busyTimeoutMs: 5,
        maxBusyRetries: 0,
      });
      try {
        expect(() => a2.ensureReady()).toThrow(
          /database is locked|SQLITE_BUSY/i,
        );
      } finally {
        abandonLocker.run("COMMIT;");
        abandonLocker.close();
      }

      // Abandon a2 without calling close(); shutting down both coordinators must close SQLite completely
      await abandonCoord1.shutdown("SIGTERM");
      await abandonCoord2.shutdown("SIGTERM");
      expect(() => a1.read(() => 1)).toThrow("Database handle is closed");

      // SQLite can only switch out of WAL mode when zero other connections hold the database open
      const verifyClosed = new Database(abandonPath);
      try {
        verifyClosed.run("PRAGMA busy_timeout = 5;");
        const mode = verifyClosed
          .query("PRAGMA journal_mode = DELETE;")
          .get() as { journal_mode: string } | null;
        expect(mode?.journal_mode.toLowerCase()).toBe("delete");
      } finally {
        verifyClosed.close();
      }
    } finally {
      closeAllDbs();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("retries transient SQLITE_BUSY locks, exhausts maxBusyRetries on persistent locks, and ignores checkpoint BUSY on close", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "devtools-db-busy-"));
    const dbPath = join(tmpDir, "busy.db");

    // Pre-initialize DB cleanly so a child process can hold BEGIN EXCLUSIVE on it
    const init = openDb({ path: dbPath });
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

    async function spawnLocker(holdMs: number) {
      const proc = Bun.spawn(
        ["bun", "-e", lockerScript, dbPath, String(holdMs)],
        {
          cwd: PACKAGE_ROOT,
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const reader = proc.stdout.getReader();
      let text = "";
      while (!text.includes("LOCKED")) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += new TextDecoder().decode(chunk.value);
      }
      return proc;
    }

    try {
      // 1. Transient lock released after 80ms -> openDb retries cold-start/write and succeeds
      const transientProc = await spawnLocker(80);
      try {
        const handle = openDb({
          path: dbPath,
          busyTimeoutMs: 5,
          maxBusyRetries: 15,
        });
        handle.write((tx) => {
          tx.insert(systemMetadata)
            .values({ key: "after_busy", value: "ok", updatedAt: new Date() })
            .run();
        });
        handle.close();
      } finally {
        await transientProc.exited;
      }

      // 2. Persistent lock exceeding maxBusyRetries throws SQLITE_BUSY on write()
      const longProc = await spawnLocker(350);
      try {
        const failingHandle = openDb({
          path: dbPath,
          busyTimeoutMs: 5,
          maxBusyRetries: 1,
        });
        expect(() =>
          failingHandle.write((tx) => {
            tx.insert(systemMetadata)
              .values({
                key: "should_fail_busy",
                value: "no",
                updatedAt: new Date(),
              })
              .run();
          }),
        ).toThrow();
        failingHandle.close();
      } finally {
        await longProc.exited;
      }

      // 3. Closing while another connection holds a write lock ignores wal_checkpoint SQLITE_BUSY
      const handleForClose = openDb({ path: dbPath, busyTimeoutMs: 5 });
      handleForClose.ensureReady();
      const rawReader = new Database(dbPath);
      rawReader.run("BEGIN IMMEDIATE;");
      try {
        expect(() => handleForClose.close()).not.toThrow();
      } finally {
        rawReader.run("COMMIT;");
        rawReader.close();
      }

      // 4. closeAllDbs() closes unclosed active handles cleanly
      const unclosedMem = openDb({ memory: true });
      unclosedMem.ensureReady();
      closeAllDbs();
      expect(() => unclosedMem.read(() => 1)).toThrow(
        "Database handle is closed",
      );
    } finally {
      closeAllDbs();
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
      closeAllDbs();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
