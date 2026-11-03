import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  eq,
  findWorkspaceRoot,
  integer,
  resolveDatabasePath,
  sql,
  sqliteTable,
  text,
} from "../src";

describe("Database Configuration & Path Resolution", () => {
  it("resolves to :memory: in test environment by default", () => {
    expect(resolveDatabasePath({ env: { NODE_ENV: "test" } })).toBe(":memory:");
  });

  it("resolves to :memory: when BUN_ENV is test", () => {
    expect(resolveDatabasePath({ env: { BUN_ENV: "test" } })).toBe(":memory:");
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

  it("respects DATABASE_URL environment variable override via env seam", () => {
    const tempPath = join(tmpdir(), "devtools-dburl-test", "url.db");
    try {
      const resolved = resolveDatabasePath({
        env: { DATABASE_URL: tempPath },
      });
      expect(resolved).toBe(tempPath);
      expect(existsSync(join(tmpdir(), "devtools-dburl-test"))).toBe(true);
    } finally {
      rmSync(join(tmpdir(), "devtools-dburl-test"), {
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

  it("resolves production default path when NODE_ENV is production", () => {
    const resolved = resolveDatabasePath({
      env: { NODE_ENV: "production" },
    });
    expect(resolved).toContain(".devtools");
    expect(resolved.endsWith("devtools.db")).toBe(true);
  });

  it("resolves default runtime path when called without arguments", () => {
    const resolved = resolveDatabasePath();
    expect(resolved).toBe(":memory:");
  });

  it("findWorkspaceRoot resolves workspace root from cwd when called without arguments", () => {
    const root = findWorkspaceRoot();
    expect(root).toBe(resolve(__dirname, "../../.."));
  });

  it("findWorkspaceRoot discovers monorepo root from nested subdirectories", () => {
    const repoRoot = resolve(__dirname, "../../..");
    const nestedDir = join(__dirname, "../src/schema");
    expect(findWorkspaceRoot(nestedDir)).toBe(repoRoot);
  });

  it("findWorkspaceRoot handles malformed package.json and returns null outside a workspace", () => {
    const isolatedDir = join(tmpdir(), `devtools-isolated-${Date.now()}`);
    mkdirSync(isolatedDir, { recursive: true });
    writeFileSync(join(isolatedDir, "package.json"), "{ invalid json");
    try {
      expect(findWorkspaceRoot(isolatedDir)).toBeNull();
    } finally {
      rmSync(isolatedDir, { recursive: true, force: true });
    }
  });

  it("anchors development database to workspace root even when running from nested cwd via seam", () => {
    const repoRoot = resolve(__dirname, "../../..");
    const nestedSubdir = join(__dirname, "../src");

    const resolved = resolveDatabasePath({
      env: { NODE_ENV: "development" },
      cwd: () => nestedSubdir,
    });
    expect(resolved).toBe(join(repoRoot, ".devtools", "devtools.db"));
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
