import { describe, expect, test } from "bun:test";
import { resolveDaemonConfig, resolveStaticDir } from "../src/daemon";

describe("Daemon Configuration & Static Directory Resolution", () => {
  test("resolveDaemonConfig returns defaults when options and env are empty", () => {
    const config = resolveDaemonConfig({ env: {} });
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4000);
    expect(config.staticDir).toBeUndefined();
  });

  test("resolveDaemonConfig defaults when called with no arguments", () => {
    const config = resolveDaemonConfig();
    expect(config.host).toBeDefined();
    expect(typeof config.port).toBe("number");
  });

  test("resolveDaemonConfig respects explicit options over env", () => {
    const config = resolveDaemonConfig({
      port: 5000,
      host: "0.0.0.0",
      env: { PORT: "3000", HOST: "10.0.0.1" },
    });
    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(5000);
  });

  test("resolveDaemonConfig respects environment overrides", () => {
    const config = resolveDaemonConfig({
      env: { PORT: "4500", HOST: "192.168.1.50" },
    });
    expect(config.host).toBe("192.168.1.50");
    expect(config.port).toBe(4500);
  });

  test("resolveDaemonConfig rejects invalid PORT strings in env with friendly message", () => {
    expect(() => resolveDaemonConfig({ env: { PORT: "4000abc" } })).toThrow(
      'Invalid environment variable PORT="4000abc": must be an integer between 0 and 65535',
    );
    expect(() => resolveDaemonConfig({ env: { PORT: "4000.5" } })).toThrow(
      'Invalid environment variable PORT="4000.5": must be an integer between 0 and 65535',
    );
    expect(() => resolveDaemonConfig({ env: { PORT: "NaN" } })).toThrow(
      'Invalid environment variable PORT="NaN": must be an integer between 0 and 65535',
    );
    expect(() => resolveDaemonConfig({ env: { PORT: "" } })).toThrow(
      'Invalid environment variable PORT="": must be an integer between 0 and 65535',
    );
    expect(() => resolveDaemonConfig({ env: { PORT: "-1" } })).toThrow(
      'Invalid environment variable PORT="-1": must be an integer between 0 and 65535',
    );
    expect(() => resolveDaemonConfig({ env: { PORT: "70000" } })).toThrow(
      'Invalid environment variable PORT="70000": must be an integer between 0 and 65535',
    );
    expect(() => resolveDaemonConfig({ port: -1, env: {} })).toThrow(
      'Invalid port number "-1": must be an integer between 0 and 65535',
    );
    expect(() => resolveDaemonConfig({ port: 65536, env: {} })).toThrow(
      'Invalid port number "65536": must be an integer between 0 and 65535',
    );
  });

  test("resolveDaemonConfig supports ephemeral port 0", () => {
    const config = resolveDaemonConfig({ port: 0, env: {} });
    expect(config.port).toBe(0);
    expect(config.host).toBe("127.0.0.1");
  });

  test("resolveDaemonConfig uniformly validates host even with port 0", () => {
    expect(() => resolveDaemonConfig({ port: 0, host: "" })).toThrow();
  });

  test("resolveStaticDir resolves explicit custom path and env overrides", () => {
    const custom = resolveStaticDir("/custom/test/dir", {});
    expect(custom).toContain("custom/test/dir");

    const fromEnv = resolveStaticDir(undefined, {
      DEVTOOLS_STATIC_DIR: "/env/static/dir",
    });
    expect(fromEnv).toContain("env/static/dir");
  });

  test("resolveStaticDir resolves default directory when called with no arguments", () => {
    const defaultDir = resolveStaticDir();
    expect(typeof defaultDir).toBe("string");
    expect(defaultDir.length).toBeGreaterThan(0);
  });
});
