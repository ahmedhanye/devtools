import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { HealthResponseSchema } from "@devtools/core";
import { createProgram, runWebCommand } from "../src/cli";
import pkg from "../../../package.json";
import { getFreePort, waitForServer } from "./support/network";

const binPath = resolve(__dirname, "../bin/devtools.js");

describe("CLI Subprocess Integration Tests", () => {
  test("boots daemon via 'devtools web --port <port> --host 127.0.0.1', serves routes, and exits code 0 on SIGTERM", async () => {
    const port = getFreePort();
    const proc = Bun.spawn(
      ["bun", binPath, "web", "--port", String(port), "--host", "127.0.0.1"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const ready = await waitForServer(port, "127.0.0.1");
      expect(ready).toBe(true);

      // Verify static root route
      const indexRes = await fetch(`http://127.0.0.1:${port}/`);
      expect(indexRes.status).toBe(200);
      const html = await indexRes.text();
      expect(html).toContain("<!DOCTYPE html>");

      // Verify api health route
      const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(healthRes.status).toBe(200);
      const json = await healthRes.json();
      expect(HealthResponseSchema.parse(json).status).toBe("ok");

      // Verify clean termination on SIGTERM
      proc.kill("SIGTERM");
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      expect(stdout).toContain(
        `DevTools daemon listening on http://127.0.0.1:${port}`,
      );
      expect(stderr).toContain("Received SIGTERM. Shutting down");
    } finally {
      proc.kill();
    }
  });

  test("exits code 0 on SIGINT", async () => {
    const port = getFreePort();
    const proc = Bun.spawn(
      ["bun", binPath, "web", "-p", String(port), "-H", "127.0.0.1"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    try {
      const ready = await waitForServer(port, "127.0.0.1");
      expect(ready).toBe(true);

      proc.kill("SIGINT");
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);

      const stderr = await new Response(proc.stderr).text();
      expect(stderr).toContain("Received SIGINT. Shutting down");
    } finally {
      proc.kill();
    }
  });

  test("fails fast with exit code 1 on port conflict in non-interactive mode", async () => {
    // Occupy a port
    const blocker = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        return new Response("blocking");
      },
    });
    const occupiedPort = blocker.port ?? 0;

    try {
      const proc = Bun.spawn(
        [
          "bun",
          binPath,
          "web",
          "--port",
          String(occupiedPort),
          "--host",
          "127.0.0.1",
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      const exitCode = await proc.exited;
      expect(exitCode).toBe(1);

      const stderr = await new Response(proc.stderr).text();
      expect(stderr).toContain(`Port ${occupiedPort} is already in use`);
      expect(stderr).toContain(`Use --port <port> or set PORT=<port>`);
    } finally {
      blocker.stop(true);
    }
  });

  test("fails fast with exit code 1 when static directory does not exist", async () => {
    const port = getFreePort();
    const proc = Bun.spawn(
      [
        "bun",
        binPath,
        "web",
        "-p",
        String(port),
        "--static-dir",
        "/invalid/dir/that/does/not/exist",
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);

    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain("Static assets directory not found");
    expect(stderr).toContain("bun run build");
  });

  test("respects PORT environment variable when --port is omitted", async () => {
    const port = getFreePort();
    const proc = Bun.spawn(["bun", binPath, "web", "-H", "127.0.0.1"], {
      env: {
        ...process.env,
        PORT: String(port),
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const ready = await waitForServer(port, "127.0.0.1");
      expect(ready).toBe(true);

      const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(healthRes.status).toBe(200);

      proc.kill("SIGTERM");
      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);
    } finally {
      proc.kill();
    }
  });
});

describe("CLI Command Structure & Parser Unit Tests", () => {
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
    program.parse(["web", "--port", "5000", "--host", "0.0.0.0"], {
      from: "user",
    });
    const webCommand = program.commands.find((cmd) => cmd.name() === "web");
    expect(webCommand?.opts().port).toBe(5000);
    expect(webCommand?.opts().host).toBe("0.0.0.0");
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
});
