import { describe, expect, test } from "bun:test";
import { createProgram, runCli, runWebCommand } from "../src/cli";
import pkg from "../../../package.json";

describe("CLI Program Configuration & Seam Tests (Unit)", () => {
  test("createProgram initializes command options and metadata", () => {
    const program = createProgram();
    expect(program.name()).toBe("devtools");
    expect(program.version()).toBe(pkg.version);

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

  test("runWebCommand resolves port conflicts across interactive and non-interactive flows", async () => {
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("occupied"),
    });
    const occupiedPort = blocker.port ?? 0;

    const origLog = console.log;
    const origErr = console.error;
    const origExit = process.exit;
    let errOutput = "";
    console.log = () => {};
    console.error = (msg: string) => {
      errOutput += msg;
    };
    process.exit = ((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as unknown as typeof process.exit;

    try {
      // 0. Default interactive check when isInteractive is not provided
      await expect(
        runWebCommand(
          { port: occupiedPort, host: "127.0.0.1" },
          { confirm: async () => false },
        ),
      ).rejects.toThrow("exit:1");

      // 1. Non-interactive conflict exits 1
      await expect(
        runWebCommand(
          { port: occupiedPort, host: "127.0.0.1" },
          { isInteractive: () => false },
        ),
      ).rejects.toThrow("exit:1");

      // 2. Interactive conflict with no available port in range exits 1
      await expect(
        runWebCommand(
          { port: occupiedPort, host: "127.0.0.1" },
          {
            isInteractive: () => true,
            findNextAvailablePort: () => null,
          },
        ),
      ).rejects.toThrow("exit:1");

      // 3. Interactive conflict declined by user exits 1
      await expect(
        runWebCommand(
          { port: occupiedPort, host: "127.0.0.1" },
          {
            isInteractive: () => true,
            confirm: async () => false,
          },
        ),
      ).rejects.toThrow("exit:1");

      // 4. Interactive conflict prompt error exits 1 with stderr diagnostic
      errOutput = "";
      await expect(
        runWebCommand(
          { port: occupiedPort, host: "127.0.0.1" },
          {
            isInteractive: () => true,
            confirm: async () => {
              throw new Error("prompt rejected");
            },
          },
        ),
      ).rejects.toThrow("exit:1");
      expect(errOutput).toContain(
        "Error: Interactive port conflict prompt failed",
      );
      expect(errOutput).toContain("prompt rejected");

      // 5. Interactive conflict accepted boots daemon on next available port
      const instance = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => true,
          confirm: async () => true,
        },
      );
      expect(instance).toBeDefined();
      expect(instance?.port).not.toBe(occupiedPort);
      await instance?.stop();
    } finally {
      console.log = origLog;
      console.error = origErr;
      process.exit = origExit;
      blocker.stop(true);
    }
  });

  test("runWebCommand registers shutdown handler and logs to stderr on signal", async () => {
    const origErr = console.error;
    const origExit = process.exit;
    let logged = "";
    console.error = (msg: string) => {
      logged += msg;
    };
    let exitCalled = false;
    process.exit = ((_code?: number) => {
      exitCalled = true;
      return undefined as never;
    }) as unknown as typeof process.exit;

    try {
      const instance = await runWebCommand({ port: 0, host: "127.0.0.1" });
      expect(instance).toBeDefined();

      process.emit("SIGTERM", "SIGTERM");
      await new Promise((r) => setTimeout(r, 50));
      expect(logged).toContain("Received SIGTERM. Shutting down");
      expect(exitCalled).toBe(true);
    } finally {
      console.error = origErr;
      process.exit = origExit;
    }
  });

  test("runWebCommand resolves configuration through options.env seam without reading global process.env", async () => {
    const origLog = console.log;
    console.log = () => {};
    try {
      const instance = await runWebCommand({
        env: {
          PORT: "0",
          HOST: "127.0.0.1",
          NODE_ENV: "test",
        },
      });
      expect(instance).toBeDefined();
      expect(instance?.hostname).toBe("127.0.0.1");
      await instance?.stop();
    } finally {
      console.log = origLog;
    }
  });

  test("runWebCommand exits 1 on invalid daemon configuration in-process", async () => {
    const origErr = console.error;
    const origExit = process.exit;
    let errMessage = "";
    console.error = (msg: string) => {
      errMessage += msg;
    };
    process.exit = ((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as unknown as typeof process.exit;

    try {
      await expect(
        runWebCommand({
          env: {
            PORT: "99999",
          },
        }),
      ).rejects.toThrow("exit:1");
      expect(errMessage).toContain(
        'Invalid environment variable PORT="99999": must be an integer between 0 and 65535',
      );
    } finally {
      console.error = origErr;
      process.exit = origExit;
    }
  });

  test("runWebCommand routes exit calls through deps.exit seam without monkey-patching process.exit", async () => {
    let exitCode: number | undefined;
    const origErr = console.error;
    console.error = () => {};

    try {
      await runWebCommand(
        {
          env: {
            PORT: "99999",
          },
        },
        {
          exit: (code) => {
            exitCode = code;
          },
        },
      );
      expect(exitCode).toBe(1);
    } finally {
      console.error = origErr;
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
    const origErr = console.error;
    console.error = () => {};

    try {
      const result = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => true,
          confirm: async () => false,
          exit: (code) => {
            exitCode = code;
          },
        },
      );
      expect(result).toBeUndefined();
      expect(exitCode).toBe(1);
    } finally {
      console.error = origErr;
      blocker.stop(true);
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
    const origErr = console.error;
    console.error = () => {};

    try {
      const result = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => true,
          confirm: async () => {
            throw new Error("terminal aborted");
          },
          exit: (code) => {
            exitCode = code;
          },
        },
      );
      expect(result).toBeUndefined();
      expect(exitCode).toBe(1);
    } finally {
      console.error = origErr;
      blocker.stop(true);
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
    const origErr = console.error;
    console.error = () => {};

    try {
      const result = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => false,
          exit: (code) => {
            exitCode = code;
          },
        },
      );
      expect(result).toBeUndefined();
      expect(exitCode).toBe(1);
    } finally {
      console.error = origErr;
      blocker.stop(true);
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
    const origErr = console.error;
    console.error = () => {};

    try {
      const result = await runWebCommand(
        { port: occupiedPort, host: "127.0.0.1" },
        {
          isInteractive: () => true,
          findNextAvailablePort: () => null,
          exit: (code) => {
            exitCode = code;
          },
        },
      );
      expect(result).toBeUndefined();
      expect(exitCode).toBe(1);
    } finally {
      console.error = origErr;
      blocker.stop(true);
    }
  });

  test("runWebCommand returns undefined and calls deps.exit(1) when startDaemon throws", async () => {
    let exitCode: number | undefined;
    const origErr = console.error;
    console.error = () => {};

    try {
      const result = await runWebCommand(
        { port: 0, staticDir: "/path/that/does/not/exist/at/all" },
        {
          exit: (code) => {
            exitCode = code;
          },
        },
      );
      expect(result).toBeUndefined();
      expect(exitCode).toBe(1);
    } finally {
      console.error = origErr;
    }
  });

  test("runCli defaults to process.argv and outputs help when invoked with no arguments", async () => {
    const origArgv = process.argv;
    const origWrite = process.stdout.write;
    process.argv = ["bun", "devtools"];
    let output = "";
    process.stdout.write = ((chunk: unknown) => {
      output += String(chunk);
      return true;
    }) as unknown as typeof process.stdout.write;

    try {
      await runCli();
      expect(output).toContain("Usage: devtools");
      expect(output).toContain("Commands:");
    } finally {
      process.argv = origArgv;
      process.stdout.write = origWrite;
    }
  });
});
