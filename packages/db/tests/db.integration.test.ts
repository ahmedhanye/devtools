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
import { createShutdownCoordinator } from "@devtools/core/node";
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
