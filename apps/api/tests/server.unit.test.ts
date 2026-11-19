import { describe, expect, test } from "bun:test";
import { RuntimeConfigError } from "@devtools/core";
import {
  createBufferOutput,
  createMemorySignalSource,
} from "@devtools/core/node";
import {
  resolveServerConfig,
  runServerCli,
  type ServerInstance,
} from "../src/app/server";
import { executeServerMain } from "../src/app/server-cli";

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

  test("rejects invalid PORT and HOST inputs with actionable RuntimeConfigError diagnostics", () => {
    for (const badPort of ["4000abc", "4000.5", "NaN", "", "   "]) {
      expect(() => resolveServerConfig({ env: { PORT: badPort } })).toThrow(
        RuntimeConfigError,
      );
      expect(() => resolveServerConfig({ env: { PORT: badPort } })).toThrow(
        `Invalid environment variable PORT="${badPort}": must be an integer between 0 and 65535`,
      );
    }

    expect(() => resolveServerConfig({ port: 70000, env: {} })).toThrow(
      'Invalid port number "70000": must be an integer between 0 and 65535',
    );
    expect(() => resolveServerConfig({ env: { HOST: "" } })).toThrow(
      'Invalid environment variable HOST="": must be a non-empty hostname or IP address',
    );
    expect(() => resolveServerConfig({ host: "", env: {} })).toThrow(
      'Invalid host "": must be a non-empty hostname or IP address',
    );
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
  test("starts server, logs listening announcement, and triggers shutdown on signal", async () => {
    let stopped = false;
    let exitCode: number | undefined;
    const signals = createMemorySignalSource();
    const output = createBufferOutput();

    const instance = runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 4000 }),
      start: () => ({
        server: {
          hostname: "127.0.0.1",
        } as unknown as ServerInstance["server"],
        port: 4000,
        stop: () => {
          stopped = true;
        },
      }),
      output,
      signals,
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(instance).toBeDefined();
    expect(output.stdout).toContain(
      "Server listening on http://127.0.0.1:4000",
    );

    expect(signals.listenerCount("SIGINT")).toBe(1);
    expect(signals.listenerCount("SIGTERM")).toBe(1);

    signals.emit("SIGTERM");
    await Bun.sleep(5);
    expect(stopped).toBe(true);
    expect(exitCode).toBe(0);
    expect(output.stdout).toContain("Shutting down server...");
    expect(output.stderr).toEqual([]);
  });

  test("catches RuntimeConfigError and Zod-shaped config errors, logs single-line diagnostic, and exits 1", () => {
    let exitCode: number | undefined;
    const output = createBufferOutput();

    const res = runServerCli({
      resolveConfig: () => {
        return resolveServerConfig({ env: { PORT: "99999" } });
      },
      output,
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(res).toBeUndefined();
    expect(exitCode).toBe(1);
    expect(output.stderr[0]).toBe(
      'Invalid server configuration: Invalid environment variable PORT="99999": must be an integer between 0 and 65535',
    );

    const hostOutput = createBufferOutput();
    let hostExitCode: number | undefined;
    runServerCli({
      resolveConfig: () => resolveServerConfig({ env: { HOST: "" } }),
      output: hostOutput,
      exit: (code) => {
        hostExitCode = code;
      },
    });
    expect(hostExitCode).toBe(1);
    expect(hostOutput.stderr[0]).toBe(
      'Invalid server configuration: Invalid environment variable HOST="": must be a non-empty hostname or IP address',
    );

    const issuesOutput = createBufferOutput();
    let issuesExitCode: number | undefined;
    runServerCli({
      resolveConfig: () => {
        // oxlint-disable-next-line typescript/only-throw-error -- intentional non-Error schema throw test
        throw { issues: [{ message: "custom schema failure" }] };
      },
      output: issuesOutput,
      exit: (code) => {
        issuesExitCode = code;
      },
    });
    expect(issuesExitCode).toBe(1);
    expect(issuesOutput.stderr[0]).toBe(
      "Invalid server configuration: custom schema failure",
    );
  });

  test("catches EADDRINUSE conflict by code or message, logs actionable message with port, and exits 1", () => {
    let exitCode: number | undefined;
    const output = createBufferOutput();

    const res = runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 4000 }),
      start: () => {
        throw Object.assign(new Error("bind failure"), { code: "EADDRINUSE" });
      },
      output,
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(res).toBeUndefined();
    expect(exitCode).toBe(1);
    expect(output.stderr[0]).toContain(
      "Port 4000 is already in use. Set PORT=<port> to use an alternate port.",
    );

    const msgOutput = createBufferOutput();
    let msgExitCode: number | undefined;
    const msgRes = runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 4001 }),
      start: () => {
        throw new Error("socket address already in use");
      },
      output: msgOutput,
      exit: (code) => {
        msgExitCode = code;
      },
    });
    expect(msgRes).toBeUndefined();
    expect(msgExitCode).toBe(1);
    expect(msgOutput.stderr[0]).toContain(
      "Port 4001 is already in use. Set PORT=<port> to use an alternate port.",
    );
  });

  test("catches generic unexpected error, logs failure, and exits 1", () => {
    let exitCode: number | undefined;
    const output = createBufferOutput();

    const res = runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 4000 }),
      start: () => {
        throw new Error("unexpected disk failure");
      },
      output,
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(res).toBeUndefined();
    expect(exitCode).toBe(1);
    expect(output.stderr[0]).toContain("Failed to start server:");
    expect(output.stderr[0]).toContain("unexpected disk failure");

    const rawRes = runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 4000 }),
      start: () => {
        // oxlint-disable-next-line typescript/only-throw-error -- intentional non-Error throw test
        throw "raw-startup-string";
      },
      output,
      exit: (code) => {
        exitCode = code;
      },
    });
    expect(rawRes).toBeUndefined();
    expect(output.stderr[1]).toContain("raw-startup-string");
  });

  test("binds to process signal source by default and detaches on stop()", async () => {
    const beforeSigint = process.listenerCount("SIGINT");
    const beforeSigterm = process.listenerCount("SIGTERM");
    const output = createBufferOutput();
    let stopped = false;

    const instance = runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 0 }),
      start: () => ({
        server: {
          hostname: "127.0.0.1",
        } as unknown as ServerInstance["server"],
        port: 0,
        stop: () => {
          stopped = true;
        },
      }),
      output,
    });

    expect(instance).toBeDefined();
    expect(process.listenerCount("SIGINT")).toBe(beforeSigint + 1);
    expect(process.listenerCount("SIGTERM")).toBe(beforeSigterm + 1);

    await instance!.stop();
    expect(stopped).toBe(true);
    expect(process.listenerCount("SIGINT")).toBe(beforeSigint);
    expect(process.listenerCount("SIGTERM")).toBe(beforeSigterm);
  });

  test("awaits async instance.stop() before exiting and force-exits on second signal", async () => {
    let stopCalls = 0;
    let releaseStop!: () => void;
    const stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const exitCodes: number[] = [];
    const signals = createMemorySignalSource();
    const output = createBufferOutput();

    runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 4000 }),
      start: () => ({
        server: {
          hostname: "127.0.0.1",
        } as unknown as ServerInstance["server"],
        port: 4000,
        stop: async () => {
          stopCalls += 1;
          await stopGate;
        },
      }),
      output,
      signals,
      exit: (code) => {
        exitCodes.push(code);
      },
    });

    signals.emit("SIGINT");
    await Bun.sleep(5);
    expect(stopCalls).toBe(1);
    expect(exitCodes).toEqual([]);

    signals.emit("SIGTERM");
    expect(stopCalls).toBe(1);
    expect(exitCodes).toEqual([143]);

    releaseStop();
    await Bun.sleep(10);
    expect(exitCodes).toEqual([143, 0]);
  });

  test("logs shutdown error and exits 1 when async instance.stop() rejects", async () => {
    const shutdownErr = new Error("stop rejected");
    const exitCodes: number[] = [];
    const signals = createMemorySignalSource();
    const output = createBufferOutput();

    runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 4000 }),
      start: () => ({
        server: {
          hostname: "127.0.0.1",
        } as unknown as ServerInstance["server"],
        port: 4000,
        stop: async () => {
          throw shutdownErr;
        },
      }),
      output,
      signals,
      exit: (code) => {
        exitCodes.push(code);
      },
    });

    signals.emit("SIGTERM");
    await Bun.sleep(10);
    expect(exitCodes).toEqual([1]);
    expect(output.stderr[0]).toContain(
      "Failed to shut down server cleanly: stop rejected",
    );
  });

  test("logs shutdown error and exits 1 when synchronous instance.stop() throws non-Error", async () => {
    const exitCodes: number[] = [];
    const signals = createMemorySignalSource();
    const output = createBufferOutput();

    runServerCli({
      resolveConfig: () => ({ host: "127.0.0.1", port: 4000 }),
      start: () => ({
        server: {
          hostname: "127.0.0.1",
        } as unknown as ServerInstance["server"],
        port: 4000,
        stop: () => {
          // oxlint-disable-next-line typescript/only-throw-error -- intentional non-Error throw test
          throw "sync stop failure";
        },
      }),
      output,
      signals,
      exit: (code) => {
        exitCodes.push(code);
      },
    });

    signals.emit("SIGINT");
    await Bun.sleep(10);
    expect(exitCodes).toEqual([1]);
    expect(output.stderr[0]).toContain(
      "Failed to shut down server cleanly: sync stop failure",
    );
  });

  test("executeServerMain only runs CLI when isMain is true", () => {
    expect(executeServerMain(false)).toBeUndefined();

    const exitCodes: number[] = [];
    const output = createBufferOutput();
    const signals = createMemorySignalSource();
    const res = executeServerMain(true, {
      resolveConfig: () => ({ host: "127.0.0.1", port: 4123 }),
      start: () => ({
        server: {
          hostname: "127.0.0.1",
        } as unknown as ServerInstance["server"],
        port: 4123,
        stop: async () => {},
      }),
      output,
      signals,
      exit: (code) => {
        exitCodes.push(code);
      },
    });
    expect(res?.port).toBe(4123);
    expect(output.stdout[0]).toContain("http://127.0.0.1:4123");
    void res?.stop();
    expect(exitCodes).toEqual([]);
  });
});
