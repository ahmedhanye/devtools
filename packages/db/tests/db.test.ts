import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createDb,
  createSqliteConnection,
  db,
  eq,
  findWorkspaceRoot,
  getDb,
  integer,
  resetDb,
  resolveDatabasePath,
  runMigrations,
  sql,
  sqliteTable,
  systemMetadata,
  text,
} from "../src";

describe("Database Configuration & Path Resolution", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("resolves to :memory: in test environment by default", () => {
    expect(resolveDatabasePath({ env: { NODE_ENV: "test" } })).toBe(":memory:");
  });

  it("respects explicit custom path argument", () => {
    const tempPath = join(tmpdir(), "devtools-test", "custom.db");
    try {
      const resolved = resolveDatabasePath(tempPath);
      expect(resolved).toBe(tempPath);
      expect(existsSync(join(tmpdir(), "devtools-test"))).toBe(true);
    } finally {
      rmSync(join(tmpdir(), "devtools-test"), { recursive: true, force: true });
    }
  });

  it("respects DEVTOOLS_DB_PATH environment variable override via env seam", () => {
    const tempPath = join(tmpdir(), "devtools-env-test", "env.db");
    try {
      const resolved = resolveDatabasePath({
        env: { DEVTOOLS_DB_PATH: tempPath },
      });
      expect(resolved).toBe(tempPath);
      expect(existsSync(join(tmpdir(), "devtools-env-test"))).toBe(true);
    } finally {
      rmSync(join(tmpdir(), "devtools-env-test"), {
        recursive: true,
        force: true,
      });
    }
  });

  it("returns :memory: if DEVTOOLS_DB_PATH is :memory:", () => {
    expect(
      resolveDatabasePath({
        env: { DEVTOOLS_DB_PATH: ":memory:" },
      }),
    ).toBe(":memory:");
  });

  it("resolves to in-repo .devtools/devtools.db in development environment via env seam", () => {
    const resolved = resolveDatabasePath({
      env: { NODE_ENV: "development" },
    });
    expect(resolved).toContain(".devtools");
    expect(resolved.endsWith("devtools.db")).toBe(true);
  });

  it("findWorkspaceRoot discovers monorepo root from nested subdirectories", () => {
    const repoRoot = resolve(__dirname, "../../..");
    const nestedDir = join(__dirname, "../src/schema");
    expect(findWorkspaceRoot(nestedDir)).toBe(repoRoot);
  });

  it("anchors development database to workspace root even when running from nested cwd", () => {
    delete process.env.DEVTOOLS_DB_PATH;
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "development";
    delete process.env.BUN_ENV;

    const originalCwd = process.cwd();
    const repoRoot = resolve(__dirname, "../../..");
    const nestedSubdir = join(__dirname, "../src");

    try {
      process.chdir(nestedSubdir);
      const resolved = resolveDatabasePath();
      expect(resolved).toBe(join(repoRoot, ".devtools", "devtools.db"));
    } finally {
      process.chdir(originalCwd);
    }
  });
});

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
  });

  it("supports getDb() singleton and resetDb()", () => {
    resetDb();
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
    resetDb();
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
  });
});

describe("Re-exported Primitives & Operators", () => {
  it("exports essential Drizzle schema primitives and query operators", () => {
    expect(typeof sqliteTable).toBe("function");
    expect(typeof text).toBe("function");
    expect(typeof integer).toBe("function");
    expect(typeof eq).toBe("function");
    expect(typeof sql).toBe("function");
  });
});
