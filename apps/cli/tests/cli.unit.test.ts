import { describe, expect, spyOn, test } from "bun:test";
import { Command } from "commander";
import { APP_VERSION } from "@devtools/core";
import {
  createBufferOutput,
  createMemorySignalSource,
} from "@devtools/core/node";
import { createProgram, executeCliMain, runCli } from "../src/app";
import { createLazyLighthouseStore } from "../src/app/program";
import { registerWebCommand, runWebCommand } from "../src/commands/web";

describe("CLI Program Configuration & Seam Tests (Unit)", () => {
  test("createProgram initializes command options and metadata", () => {
    const program = createProgram();
    expect(program.name()).toBe("devtools");
    expect(program.version()).toBe(APP_VERSION);

    const webCommand = program.commands.find((cmd) => cmd.name() === "web");
    expect(webCommand).toBeDefined();

    const optionNames = webCommand?.options.map((opt) => opt.name());
    expect(optionNames).toContain("port");
    expect(optionNames).toContain("host");
    expect(optionNames).toContain("static-dir");
  });

  test("createProgram parses web options accurately", () => {
    const program = createProgram();
    const webCommand = program.commands.find((cmd) => cmd.name() === "web");
    webCommand?.action(() => {});
    program.parse(["web", "--port", "5000", "--host", "0.0.0.0"], {
      from: "user",
    });
    expect(webCommand?.opts().port).toBe(5000);
    expect(webCommand?.opts().host).toBe("0.0.0.0");
  });

  test("createProgram rejects invalid port argument", () => {
    const program = createProgram();
    const webCommand = program.commands.find((cmd) => cmd.name() === "web");
    webCommand?.exitOverride();
    webCommand?.configureOutput({ writeErr: () => {} });
    expect(() => {
      program.parse(["web", "--port", "4000abc"], { from: "user" });
    }).toThrow();
  });

  test("runWebCommand exports correctly as a callable async function", () => {
    expect(typeof runWebCommand).toBe("function");
  });

  test("runWebCommand handles occupied port when isInteractive is omitted across TTY and non-TTY runners", async () => {
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("occupied"),
    });
    const occupiedPort = blocker.port ?? 0;
    const output = createBufferOutput();
    const exitCodes: number[] = [];

    try {
      const result = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          // Avoid hanging on @inquirer/prompts when test runner executes inside a PTY
          confirm: async () => false,
          output,
          exit: (code = 1) => {
            exitCodes.push(code);
          },
        },
      );
      expect(result).toBeUndefined();
      expect(exitCodes).toEqual([1]);
      expect(output.stderr.length).toBeGreaterThan(0);
    } finally {
      await blocker.stop(true);
    }
  });

  test("runWebCommand boots daemon on next available port when interactive conflict is accepted", async () => {
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("occupied"),
    });
    const occupiedPort = blocker.port ?? 0;
    const output = createBufferOutput();
    const signals = createMemorySignalSource();
    const exitCodes: number[] = [];

    try {
      const instance = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => true,
          confirm: async () => true,
          output,
          signals,
          exit: (code = 1) => {
            exitCodes.push(code);
          },
        },
      );
      expect(instance).toBeDefined();
      expect(instance?.port).not.toBe(occupiedPort);
      expect(exitCodes).toEqual([]);
      expect(output.stdout.join("\n")).toContain(
        `DevTools daemon listening on http://127.0.0.1:${instance?.port}`,
      );
      await instance?.stop();
    } finally {
      await blocker.stop(true);
    }
  });

  test("runWebCommand registers shutdown handler and logs to stderr on signal", async () => {
    const signals = createMemorySignalSource();
    const output = createBufferOutput();
    const exitCodes: Array<number | undefined> = [];

    const instance = await runWebCommand(
      { port: 0, host: "127.0.0.1" },
      {
        signals,
        output,
        exit: (code) => {
          exitCodes.push(code);
        },
      },
    );
    expect(instance).toBeDefined();
    expect(signals.listenerCount("SIGINT")).toBe(1);
    expect(signals.listenerCount("SIGTERM")).toBe(1);
    expect(output.stdout.join("\n")).toContain(
      "DevTools daemon listening on http://127.0.0.1:",
    );

    signals.emit("SIGTERM");
    await Bun.sleep(20);
    expect(output.stderr.join("\n")).toContain(
      "Received SIGTERM. Shutting down",
    );
    expect(exitCodes).toEqual([0]);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });

  test("runWebCommand detaches default process signal handlers when stopped programmatically", async () => {
    const beforeSigint = process.listenerCount("SIGINT");
    const beforeSigterm = process.listenerCount("SIGTERM");
    const origLog = console.log;
    console.log = () => {};
    try {
      const instance = await runWebCommand({ port: 0, host: "127.0.0.1" });
      expect(instance).toBeDefined();
      expect(process.listenerCount("SIGINT")).toBe(beforeSigint + 1);
      expect(process.listenerCount("SIGTERM")).toBe(beforeSigterm + 1);

      await instance?.stop();
      expect(process.listenerCount("SIGINT")).toBe(beforeSigint);
      expect(process.listenerCount("SIGTERM")).toBe(beforeSigterm);
    } finally {
      console.log = origLog;
    }
  });

  test("runWebCommand logs formatted error and exits 1 when daemon teardown rejects", async () => {
    const signals = createMemorySignalSource();
    const output = createBufferOutput();
    const exitCodes: Array<number | undefined> = [];

    const instance = await runWebCommand(
      { port: 0, host: "127.0.0.1" },
      {
        signals,
        output,
        startDaemon: () => ({
          server: {} as never,
          port: 4000,
          hostname: "127.0.0.1",
          staticDir: "/tmp/static",
          stop: () => {
            throw new Error("boom-work");
          },
        }),
        exit: (code) => {
          exitCodes.push(code);
        },
      },
    );
    expect(instance).toBeDefined();

    signals.emit("SIGTERM");
    await Bun.sleep(20);
    expect(output.stderr.join("\n")).toContain(
      "Error during daemon shutdown: boom-work",
    );
    expect(exitCodes).toEqual([1]);

    const signals2 = createMemorySignalSource();
    const output2 = createBufferOutput();
    const exitCodes2: Array<number | undefined> = [];
    await runWebCommand(
      { port: 0, host: "127.0.0.1" },
      {
        signals: signals2,
        output: output2,
        startDaemon: () => ({
          server: {} as never,
          port: 4000,
          hostname: "127.0.0.1",
          staticDir: "/tmp/static",
          stop: () => {
            // oxlint-disable-next-line typescript/only-throw-error -- intentional non-Error throw test
            throw "raw-shutdown-err";
          },
        }),
        exit: (code) => {
          exitCodes2.push(code);
        },
      },
    );
    signals2.emit("SIGINT");
    await Bun.sleep(20);
    expect(output2.stderr.join("\n")).toContain(
      "Error during daemon shutdown: raw-shutdown-err",
    );
    expect(exitCodes2).toEqual([1]);
  });

  test("runWebCommand resolves configuration through options.env seam without reading global process.env", async () => {
    const output = createBufferOutput();
    const signals = createMemorySignalSource();
    const instance = await runWebCommand(
      {
        env: {
          PORT: "0",
          HOST: "127.0.0.1",
          NODE_ENV: "test",
        },
      },
      { output, signals },
    );
    expect(instance).toBeDefined();
    expect(instance?.hostname).toBe("127.0.0.1");
    await instance?.stop();
  });

  test("runWebCommand logs actionable config errors and calls deps.exit(1) without monkey-patching process.exit", async () => {
    const cases = [
      {
        options: { env: { PORT: "99999" } },
        expected:
          'Invalid environment variable PORT="99999": must be an integer between 0 and 65535',
      },
      {
        options: { host: "", port: 0, env: {} },
        expected:
          'Invalid --host "": must be a non-empty hostname or IP address',
      },
      {
        options: { staticDir: "", port: 0, env: {} },
        expected: "Invalid --static-dir: path must not be empty",
      },
    ];

    for (const testCase of cases) {
      let exitCode: number | undefined;
      const output = createBufferOutput();
      const result = await runWebCommand(testCase.options, {
        output,
        exit: (code) => {
          exitCode = code;
        },
      });
      expect(result).toBeUndefined();
      expect(exitCode).toBe(1);
      expect(output.stderr.join("\n")).toContain(testCase.expected);
    }
  });

  test("runWebCommand returns undefined and calls deps.exit(1) on port conflict when user declines", async () => {
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("busy");
      },
    });
    const occupiedPort = blocker.port ?? 0;
    let exitCode: number | undefined;
    const output = createBufferOutput();

    try {
      const result = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => true,
          confirm: async () => false,
          output,
          exit: (code) => {
            exitCode = code;
          },
        },
      );
      expect(result).toBeUndefined();
      expect(exitCode).toBe(1);
      expect(output.stderr.join("\n")).toContain("Aborted server start.");
    } finally {
      await blocker.stop(true);
    }
  });

  test("runWebCommand returns undefined and calls deps.exit(1) when interactive prompt throws", async () => {
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("busy");
      },
    });
    const occupiedPort = blocker.port ?? 0;
    let exitCode: number | undefined;
    const output = createBufferOutput();

    try {
      const result = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => true,
          confirm: async () => {
            throw new Error("terminal aborted");
          },
          output,
          exit: (code) => {
            exitCode = code;
          },
        },
      );
      expect(result).toBeUndefined();
      expect(exitCode).toBe(1);
      expect(output.stderr.join("\n")).toContain(
        "Error: Interactive port conflict prompt failed: terminal aborted",
      );
    } finally {
      await blocker.stop(true);
    }
  });

  test("runWebCommand treats ExitPromptError and aborted signal during port prompt as clean Ctrl+C cancel", async () => {
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("busy");
      },
    });
    const occupiedPort = blocker.port ?? 0;

    try {
      // Case A: ExitPromptError without aborted host signal exits 130 cleanly
      let exitCodeA: number | undefined;
      const outputA = createBufferOutput();
      const resultA = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => true,
          confirm: async () => {
            throw Object.assign(new Error("User force closed the prompt"), {
              name: "ExitPromptError",
            });
          },
          output: outputA,
          exit: (code) => {
            exitCodeA = code;
          },
        },
      );
      expect(resultA).toBeUndefined();
      expect(outputA.stderr).toEqual([]);
      expect(exitCodeA).toBe(130);

      // Case B: Already-aborted signal suppresses exit() so main.ts owns exit 130
      let exitCodeB: number | undefined;
      const outputB = createBufferOutput();
      const controller = new AbortController();
      const resultB = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => true,
          signal: controller.signal,
          confirm: async () => {
            controller.abort(new Error("Received SIGINT"));
            throw new Error("prompt closed");
          },
          output: outputB,
          exit: (code) => {
            exitCodeB = code;
          },
        },
      );
      expect(resultB).toBeUndefined();
      expect(outputB.stderr).toEqual([]);
      expect(exitCodeB).toBeUndefined();
    } finally {
      await blocker.stop(true);
    }
  });

  test("runWebCommand returns undefined and calls deps.exit(1) on port conflict in non-interactive mode", async () => {
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("busy");
      },
    });
    const occupiedPort = blocker.port ?? 0;
    let exitCode: number | undefined;
    const output = createBufferOutput();

    try {
      const result = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => false,
          output,
          exit: (code) => {
            exitCode = code;
          },
        },
      );
      expect(result).toBeUndefined();
      expect(exitCode).toBe(1);
      expect(output.stderr.join("\n")).toContain(
        `Port ${occupiedPort} is already in use`,
      );
    } finally {
      await blocker.stop(true);
    }
  });

  test("runWebCommand returns undefined and calls deps.exit(1) when no port available in range", async () => {
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("busy");
      },
    });
    const occupiedPort = blocker.port ?? 0;
    let exitCode: number | undefined;
    const output = createBufferOutput();

    try {
      const result = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => true,
          findNextAvailablePort: () => null,
          output,
          exit: (code) => {
            exitCode = code;
          },
        },
      );
      expect(result).toBeUndefined();
      expect(exitCode).toBe(1);
      expect(output.stderr.join("\n")).toContain(
        "no available port was found in range",
      );
    } finally {
      await blocker.stop(true);
    }
  });

  test("runWebCommand returns undefined and calls deps.exit(1) when startDaemon throws", async () => {
    let exitCode: number | undefined;
    const output = createBufferOutput();

    const result = await runWebCommand(
      { port: 0, staticDir: "/path/that/does/not/exist/at/all" },
      {
        output,
        exit: (code) => {
          exitCode = code;
        },
      },
    );
    expect(result).toBeUndefined();
    expect(exitCode).toBe(1);
    expect(output.stderr.join("\n")).toContain(
      "Static assets directory not found",
    );
  });

  test("runCli dispatches help, flag errors, and subcommands via deps seams without monkey-patching process globals", async () => {
    const noArgSignals = createMemorySignalSource();
    const noArgOutput = createBufferOutput();
    await runCli(["bun", "devtools"], {
      signals: noArgSignals,
      output: noArgOutput,
      exit: () => {},
    });
    expect(noArgOutput.stdout.join("\n")).toContain("Usage: devtools");
    expect(noArgOutput.stdout.join("\n")).toContain("Commands:");
    expect(noArgSignals.listenerCount("SIGINT")).toBe(0);
    expect(noArgSignals.listenerCount("SIGTERM")).toBe(0);

    const helpSignals = createMemorySignalSource();
    const helpOutput = createBufferOutput();
    const helpExitCodes: number[] = [];
    await runCli(["bun", "devtools", "--help"], {
      signals: helpSignals,
      output: helpOutput,
      exit: (code) => {
        helpExitCodes.push(code);
      },
    });
    expect(helpExitCodes).toEqual([0]);
    expect(helpOutput.stdout.join("\n")).toContain("Usage: devtools");

    const errSignals = createMemorySignalSource();
    const errOutput = createBufferOutput();
    const errExitCodes: number[] = [];
    await runCli(["bun", "devtools", "--unknown-flag"], {
      signals: errSignals,
      output: errOutput,
      exit: (code) => {
        errExitCodes.push(code);
      },
    });
    expect(errExitCodes).toEqual([1]);
    expect(errOutput.stderr.join("\n")).toContain("unknown option");

    await expect(
      runCli(["bun", "devtools"], {
        signals: createMemorySignalSource(),
        output: {
          writeStdout: () => {
            throw new Error("stdout broken");
          },
          writeStderr: () => {},
        },
        exit: () => {},
      }),
    ).rejects.toThrow("stdout broken");

    const origConsoleLog = console.log;
    const listStdout: string[] = [];
    console.log = (msg: string) => {
      listStdout.push(msg);
    };
    const subSignals = createMemorySignalSource();
    const subOutput = createBufferOutput();
    const subExitCodes: number[] = [];
    try {
      let resolveSubExited!: () => void;
      const subExited = new Promise<void>((resolve) => {
        resolveSubExited = resolve;
      });
      const cliPromise = runCli(["bun", "devtools", "lighthouse", "list"], {
        signals: subSignals,
        output: subOutput,
        exit: (code) => {
          subExitCodes.push(code);
          resolveSubExited();
        },
      });
      subSignals.emit("SIGINT");
      await Promise.all([cliPromise, subExited]);
      expect(listStdout.join("\n")).not.toContain("Usage: devtools [options]");
      expect(subExitCodes).toEqual([130]);
      expect(subSignals.listenerCount("SIGINT")).toBe(0);
    } finally {
      console.log = origConsoleLog;
    }

    const webSignals = createMemorySignalSource();
    const webOutput = createBufferOutput();
    const webExitCodes: number[] = [];
    let resolveWebExited!: () => void;
    const webExited = new Promise<void>((resolve) => {
      resolveWebExited = resolve;
    });
    await runCli(
      ["bun", "devtools", "web", "--port", "0", "--host", "127.0.0.1"],
      {
        signals: webSignals,
        output: webOutput,
        exit: (code) => {
          webExitCodes.push(code);
          resolveWebExited();
        },
      },
    );
    // Outer CLI listener was detached onDaemonStarted; only daemon's listener remains
    expect(webSignals.listenerCount("SIGINT")).toBe(1);
    expect(webSignals.listenerCount("SIGTERM")).toBe(1);
    webSignals.emit("SIGTERM");
    await webExited;
    expect(webExitCodes).toEqual([0]);
    expect(webSignals.listenerCount("SIGTERM")).toBe(0);
  });

  test("createLazyLighthouseStore dynamically opens, replaces, and closes SQLite handles", async () => {
    const controller = createLazyLighthouseStore();
    controller.closeStore();
    const store1 = await controller.openStore({
      env: { DEVTOOLS_DB_PATH: ":memory:" },
    });
    expect(store1.listRuns()).toEqual([]);

    const store2 = await controller.openStore({
      env: { DEVTOOLS_DB_PATH: ":memory:" },
    });
    expect(store2.listRuns()).toEqual([]);
    // Prior DB handle was closed when opening the second one
    expect(() => store1.listRuns()).toThrow("Database handle is closed");

    controller.closeStore();
    expect(() => store2.listRuns()).toThrow("Database handle is closed");
    controller.closeStore();
  });

  test("executeCliMain and bin/devtools.js respect import.meta.main guard and fatal catch seam", async () => {
    // @ts-expect-error Executable JS wrapper script intentionally has no TypeScript declaration file.
    await import("../bin/devtools.js");
    expect(executeCliMain(false)).toBeUndefined();

    const okOutput = createBufferOutput();
    const okExitCodes: number[] = [];
    await executeCliMain(true, {
      argv: ["bun", "devtools"],
      signals: createMemorySignalSource(),
      output: okOutput,
      exit: (code) => {
        okExitCodes.push(code);
      },
    });
    expect(okOutput.stdout.join("\n")).toContain("Usage: devtools");
    expect(okExitCodes).toEqual([]);

    const fatalStderr: string[] = [];
    const fatalExitCodes: number[] = [];
    await executeCliMain(true, {
      argv: ["bun", "devtools"],
      signals: createMemorySignalSource(),
      output: {
        writeStdout: () => {
          throw new Error("fatal cli boom");
        },
        writeStderr: (msg) => {
          fatalStderr.push(msg);
        },
      },
      exit: (code) => {
        fatalExitCodes.push(code);
      },
    });
    expect(fatalStderr.join("\n")).toContain("fatal cli boom");
    expect(fatalExitCodes).toEqual([1]);
  });

  test("registerWebCommand dispatches parsed options to injected runWebCommand seam", async () => {
    const program = new Command();
    const calls: Array<
      { port?: number; host?: string; staticDir?: string } | undefined
    > = [];
    registerWebCommand(program, {
      runWebCommand: async (opts) => {
        calls.push(opts);
        return undefined;
      },
    });

    await program.parseAsync(
      [
        "web",
        "--port",
        "4123",
        "--host",
        "127.0.0.1",
        "--static-dir",
        "/tmp/w",
      ],
      { from: "user" },
    );
    expect(calls).toEqual([
      { port: 4123, host: "127.0.0.1", staticDir: "/tmp/w" },
    ]);
  });

  test("runWebCommand falls back to process.exit(1) when deps.exit is omitted", async () => {
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      routes: { "/": new Response("occupied") },
    });
    const output = createBufferOutput();
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => undefined) as never,
    );

    try {
      const result = await runWebCommand(
        { port: blocker.port ?? 0, host: "127.0.0.1" },
        {
          confirm: async () => false,
          output,
        },
      );
      expect(result).toBeUndefined();
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
      await blocker.stop(true);
    }
  });
});
