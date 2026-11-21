import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  eq,
  integer,
  resolveDatabasePath,
  resolveDatabaseTargetPath,
  sql,
  sqliteTable,
  text,
} from "../src";
import {
  EMBEDDED_SQL_BY_TAG,
  resolveEmbeddedMigrations,
} from "../src/migrator";

describe("Database Configuration & Path Resolution", () => {
  it("resolves to :memory: when memory: true is passed regardless of env or path", () => {
    expect(
      resolveDatabasePath({
        memory: true,
        customPath: "/tmp/should-be-ignored.db",
        env: {
          NODE_ENV: "production",
          DEVTOOLS_DB_PATH: "/tmp/also-ignored.db",
        },
      }),
    ).toBe(":memory:");
  });

  it("resolves to :memory: in test environment by default", () => {
    expect(
      resolveDatabasePath({ env: { NODE_ENV: "test" }, isStandalone: false }),
    ).toBe(":memory:");
    expect(
      resolveDatabasePath({ env: { BUN_ENV: "test" }, isStandalone: false }),
    ).toBe(":memory:");
  });

  it("respects explicit custom path argument", () => {
    const tempPath = join(tmpdir(), `devtools-test-${Date.now()}`, "custom.db");
    const tempDir = join(tempPath, "..");
    try {
      const resolved = resolveDatabasePath(tempPath);
      expect(resolved).toBe(tempPath);
      expect(existsSync(tempDir)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("respects DEVTOOLS_DB_PATH and DATABASE_URL overrides via env seam", () => {
    const tempDir = join(tmpdir(), `devtools-env-${Date.now()}`);
    const envPath = join(tempDir, "env.db");
    const urlPath = join(tempDir, "url.db");
    try {
      expect(
        resolveDatabasePath({
          customPath: envPath,
          env: {
            DEVTOOLS_DB_PATH: urlPath,
            DATABASE_URL: join(tempDir, "fallback.db"),
          },
          isStandalone: false,
        }),
      ).toBe(envPath);
      expect(
        resolveDatabasePath({
          env: {
            DEVTOOLS_DB_PATH: envPath,
            DATABASE_URL: urlPath,
          },
          isStandalone: false,
        }),
      ).toBe(envPath);
      expect(
        resolveDatabasePath({
          env: { DATABASE_URL: urlPath },
          isStandalone: false,
        }),
      ).toBe(urlPath);
      expect(
        resolveDatabasePath({
          env: { DEVTOOLS_DB_PATH: "rel/local.db" },
          cwd: () => tempDir,
          isStandalone: false,
        }),
      ).toBe(join(tempDir, "rel", "local.db"));
      expect(
        resolveDatabasePath({
          env: { DEVTOOLS_DB_PATH: ":memory:" },
          isStandalone: false,
        }),
      ).toBe(":memory:");
      expect(
        resolveDatabasePath(undefined, {
          NODE_ENV: "production",
        }),
      ).toBe(join(homedir(), ".devtools", "devtools.db"));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves to in-repo .devtools/devtools.db in development when not standalone", () => {
    const repoRoot = resolve(import.meta.dir, "../../..");
    const nestedSubdir = join(import.meta.dir, "../src");
    const resolved = resolveDatabasePath({
      env: { NODE_ENV: "development" },
      cwd: () => nestedSubdir,
      isStandalone: false,
    });
    expect(resolved).toBe(join(repoRoot, ".devtools", "devtools.db"));
  });

  it("falls back to cwd when outside a workspace in development", () => {
    const isolatedDir = join(tmpdir(), `devtools-db-isolated-${Date.now()}`);
    mkdirSync(isolatedDir, { recursive: true });
    writeFileSync(join(isolatedDir, "package.json"), "{ bad json");
    try {
      const resolved = resolveDatabasePath({
        env: { NODE_ENV: "development" },
        cwd: () => isolatedDir,
        isStandalone: false,
      });
      expect(resolved).toBe(join(isolatedDir, ".devtools", "devtools.db"));
    } finally {
      rmSync(isolatedDir, { recursive: true, force: true });
    }
  });

  it("defaults compiled standalone binaries and production to ~/.devtools/devtools.db", () => {
    const expectedProdPath = join(homedir(), ".devtools", "devtools.db");

    expect(
      resolveDatabasePath({
        env: { NODE_ENV: "development" },
        isStandalone: true,
      }),
    ).toBe(expectedProdPath);

    expect(
      resolveDatabasePath({
        env: { NODE_ENV: "production" },
        isStandalone: false,
      }),
    ).toBe(expectedProdPath);
  });

  it("resolves default runtime path when called without arguments", () => {
    expect(resolveDatabasePath()).toBe(":memory:");
    expect(resolveDatabaseTargetPath()).toBe(":memory:");
  });
});

describe("resolveEmbeddedMigrations", () => {
  it("parses valid journal entries using the embedded SQL registry", () => {
    const migrations = resolveEmbeddedMigrations([
      { tag: "0000_init", when: 1000 },
      { tag: "0001_brave_lilandra", when: 2000 },
    ]);
    expect(migrations).toHaveLength(2);
    expect(migrations[0]?.folderMillis).toBe(1000);
    expect(migrations[0]?.statements.length).toBeGreaterThan(0);
    expect(migrations[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(EMBEDDED_SQL_BY_TAG["0000_init"]).toContain("CREATE TABLE");
  });

  it("throws an actionable error when a journal tag is missing or empty", () => {
    expect(() =>
      resolveEmbeddedMigrations([{ tag: "0002_missing", when: 3000 }], {
        "0000_init": "CREATE TABLE x (id text);",
      }),
    ).toThrow('Missing embedded SQL migration for journal tag "0002_missing"');

    expect(() =>
      resolveEmbeddedMigrations([{ tag: "0002_empty", when: 3000 }], {
        "0002_empty": "   ",
      }),
    ).toThrow('Missing embedded SQL migration for journal tag "0002_empty"');
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
