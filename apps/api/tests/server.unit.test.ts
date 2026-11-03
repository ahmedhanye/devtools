import { describe, expect, test } from "bun:test";
import { resolveServerConfig, runServerCli } from "../src/server";

describe("Server Configuration Resolution", () => {
  test("returns defaults when options and env are empty", () => {
    const config = resolveServerConfig({ env: {} });
    expect(config.port).toBe(4000);
    expect(config.host).toBe("127.0.0.1");
  });

  test("returns defaults when called with no arguments", () => {
    const config = resolveServerConfig();
    expect(typeof config.port).toBe("number");
    expect(typeof config.host).toBe("string");
  });

  test("prefers options over env", () => {
    const config = resolveServerConfig({
      port: 5000,
      host: "0.0.0.0",
      env: { PORT: "3000", HOST: "10.0.0.1" },
    });
    expect(config.port).toBe(5000);
    expect(config.host).toBe("0.0.0.0");
  });

  test("supports hostname option alias for Bun.serve compatibility", () => {
    const config = resolveServerConfig({
      hostname: "0.0.0.0",
      env: {},
    });
    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(4000);
  });

  test("uses env when options are not provided", () => {
    const config = resolveServerConfig({
      env: { PORT: "4500", HOST: "192.168.1.50" },
    });
    expect(config.port).toBe(4500);
    expect(config.host).toBe("192.168.1.50");
  });

  test("rejects invalid PORT strings in env", () => {
    expect(() => resolveServerConfig({ env: { PORT: "4000abc" } })).toThrow();
    expect(() => resolveServerConfig({ env: { PORT: "4000.5" } })).toThrow();
    expect(() => resolveServerConfig({ env: { PORT: "NaN" } })).toThrow();
    expect(() => resolveServerConfig({ env: { PORT: "   " } })).toThrow();
  });

  test("trims whitespace from PORT env var", () => {
    const cfg = resolveServerConfig({
      env: { PORT: "  4321  " },
    });
    expect(cfg.port).toBe(4321);
  });

  test("resolveServerConfig respects injected env seam", () => {
    const cfg = resolveServerConfig({
      env: { HOST: "0.0.0.0", PORT: "4321" },
    });
    expect(cfg).toEqual({ host: "0.0.0.0", port: 4321 });
  });

  test("supports ephemeral port 0", () => {
    const cfg = resolveServerConfig({ port: 0, env: {} });
    expect(cfg.port).toBe(0);
    expect(cfg.host).toBe("127.0.0.1");
  });
});

describe("runServerCli", () => {
  test("starts server, logs listening announcement, and triggers shutdown on signal", () => {
    let stopped = false;
    let exitCode: number | undefined;
    const signals: Record<string, () => void> = {};
    const logs: string[] = [];

    const instance = runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 4000 }),
      start: () => ({
        server: { hostname: "127.0.0.1" } as any,
        port: 4000,
        stop: () => {
          stopped = true;
        },
      }),
      log: (msg) => logs.push(msg),
      exit: (code) => {
        exitCode = code;
      },
      onSignal: (evt, handler) => {
        signals[evt] = handler;
      },
    });

    expect(instance).toBeDefined();
    expect(logs).toContain("Server listening on http://127.0.0.1:4000");

    expect(signals.SIGINT).toBeDefined();
    expect(signals.SIGTERM).toBeDefined();

    signals.SIGTERM?.();
    expect(stopped).toBe(true);
    expect(exitCode).toBe(0);
    expect(logs).toContain("Shutting down server...");
  });

  test("catches ZodError, logs single-line diagnostic, and exits 1", () => {
    let exitCode: number | undefined;
    const errors: string[] = [];

    const res = runServerCli({
      resolveConfig: () => {
        return resolveServerConfig({ env: { PORT: "99999" } });
      },
      error: (msg) => errors.push(msg),
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(res).toBeUndefined();
    expect(exitCode).toBe(1);
    expect(errors[0]).toContain("Invalid server configuration:");
    expect(errors[0]).toContain("65535");
  });

  test("catches EADDRINUSE conflict, logs actionable message with port, and exits 1", () => {
    let exitCode: number | undefined;
    const errors: string[] = [];

    const res = runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 4000 }),
      start: () => {
        const err = new Error("address already in use");
        (err as any).code = "EADDRINUSE";
        throw err;
      },
      error: (msg) => errors.push(msg),
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(res).toBeUndefined();
    expect(exitCode).toBe(1);
    expect(errors[0]).toContain(
      "Port 4000 is already in use. Set PORT=<port> to use an alternate port.",
    );
  });

  test("catches generic unexpected error, logs failure, and exits 1", () => {
    let exitCode: number | undefined;
    const errors: string[] = [];

    const res = runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 4000 }),
      start: () => {
        throw new Error("unexpected disk failure");
      },
      error: (msg, ...rest) => errors.push([msg, ...rest].join(" ")),
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(res).toBeUndefined();
    expect(exitCode).toBe(1);
    expect(errors[0]).toContain("Failed to start server:");
  });

  test("uses default onSignal handler to register process signal listeners", () => {
    const origOn = process.on;
    const registered: string[] = [];
    process.on = ((event: string) => {
      registered.push(event);
      return process;
    }) as any;

    try {
      const instance = runServerCli({
        resolveConfig: () => ({ host: "127.0.0.1", port: 0 }),
        start: () => ({
          server: { hostname: "127.0.0.1" } as any,
          port: 0,
          stop: () => {},
        }),
        log: () => {},
      });
      expect(instance).toBeDefined();
      expect(registered).toContain("SIGINT");
      expect(registered).toContain("SIGTERM");
    } finally {
      process.on = origOn;
    }
  });
});
