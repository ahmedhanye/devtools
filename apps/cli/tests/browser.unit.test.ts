import { describe, expect, spyOn, test } from "bun:test";
import { Command } from "commander";
import {
  type BrowserInstallOptions,
  type BrowserStatusOptions,
  createProgram,
  registerBrowserCommands,
  runBrowserInstallCommand,
  runBrowserStatusCommand,
} from "../src/index";

describe("CLI Browser Command Surface (Unit)", () => {
  test("createProgram registers browser command with install and status subcommands", () => {
    const program = createProgram();
    const browserCmd = program.commands.find((cmd) => cmd.name() === "browser");
    expect(browserCmd).toBeDefined();

    const subcommands = browserCmd?.commands.map((cmd) => cmd.name());
    expect(subcommands).toContain("install");
    expect(subcommands).toContain("status");

    const statusCmd = browserCmd?.commands.find(
      (cmd) => cmd.name() === "status",
    );
    const statusOptionNames = statusCmd?.options.map((opt) => opt.name());
    expect(statusOptionNames).toContain("json");
    expect(statusOptionNames).toContain("chrome-path");
    expect(statusOptionNames).toContain("path");

    const installCmd = browserCmd?.commands.find(
      (cmd) => cmd.name() === "install",
    );
    const installOptionNames = installCmd?.options.map((opt) => opt.name());
    expect(installOptionNames).toContain("path");
  });

  test("exports runBrowserStatusCommand and runBrowserInstallCommand as async functions", () => {
    expect(typeof runBrowserStatusCommand).toBe("function");
    expect(typeof runBrowserInstallCommand).toBe("function");
  });

  test("status command exits 1 with remediation error in human mode when no browser is found", async () => {
    const errors: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    let exitCode: number | undefined;

    try {
      await runBrowserStatusCommand(
        {},
        {
          exit: (code) => {
            exitCode = code;
          },
          getBrowserStatus: async () => ({
            found: false,
            code: "BROWSER_NOT_FOUND",
            error:
              'No Chromium-compatible browser found.\nRun "devtools browser install" to install Chrome for Testing,\nor pass "--chrome-path <path>" to specify an existing binary.',
          }),
        },
      );
      expect(exitCode).toBe(1);
    } finally {
      console.error = origError;
    }

    const combined = errors.join("\n");
    expect(combined).toContain("No Chromium-compatible browser found.");
    expect(combined).toContain('Run "devtools browser install"');
  });

  test("status command exits 1 with JSON payload in --json mode when no browser is found", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
    let exitCode: number | undefined;

    try {
      await runBrowserStatusCommand(
        { json: true },
        {
          exit: (code) => {
            exitCode = code;
          },
          getBrowserStatus: async () => ({
            found: false,
            code: "BROWSER_NOT_FOUND",
            error:
              'No Chromium-compatible browser found.\nRun "devtools browser install" to install Chrome for Testing,\nor pass "--chrome-path <path>" to specify an existing binary.',
          }),
        },
      );
      expect(exitCode).toBe(1);
    } finally {
      console.log = origLog;
    }

    const output = logs.join("\n");
    const parsed = JSON.parse(output.trim());
    expect(parsed.found).toBe(false);
    expect(parsed.code).toBe("BROWSER_NOT_FOUND");
    expect(parsed.error).toContain("No Chromium-compatible browser found.");
    expect(parsed.error).toContain('Run "devtools browser install"');
  });

  test("runBrowserInstallCommand executes installer and outputs success", async () => {
    const mockInstalledPath = "/mock/cache/dir/installed-browser";
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    try {
      await runBrowserInstallCommand(
        { path: "/mock/cache/dir" },
        {
          installBrowser: async (opts) => {
            opts?.onProgress?.(0, 0);
            opts?.onProgress?.(50, 100);
            return {
              executablePath: mockInstalledPath,
              buildId: "130.0.6723.69",
              browser: "chrome-headless-shell",
            };
          },
        },
      );

      const combinedLogs = logs.join("\n");
      expect(combinedLogs).toContain("Successfully installed");
      expect(combinedLogs).toContain("chrome-headless-shell@130.0.6723.69");
      expect(combinedLogs).toContain(mockInstalledPath);
    } finally {
      console.log = origLog;
    }
  });

  test("runBrowserInstallCommand isolates stdout and stderr color formatting for redirected output", async () => {
    const origLog = console.log;
    const origErr = console.error;
    const stdoutLogs: string[] = [];
    const stderrLogs: string[] = [];
    console.log = (...args: any[]) => stdoutLogs.push(args.join(" "));
    console.error = (...args: any[]) => stderrLogs.push(args.join(" "));

    try {
      // Case 1: stderr is TTY, stdout is redirected (non-TTY)
      await runBrowserInstallCommand(
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: true,
          isStdoutTTY: false,
          writeStderr: () => {},
          installBrowser: async () => ({
            executablePath: "/path/to/chrome",
            buildId: "130.0.0",
            browser: "chrome-headless-shell",
          }),
        },
      );

      const stderrCombined = stderrLogs.join("\n");
      const stdoutCombined = stdoutLogs.join("\n");
      // Diagnostic on stderr should be colorized
      expect(stderrCombined.includes("\x1b[")).toBe(true);
      // Result on stdout redirected to file should be sanitized plain text
      expect(stdoutCombined.includes("\x1b[")).toBe(false);

      stdoutLogs.length = 0;
      stderrLogs.length = 0;

      // Case 2: stderr is redirected (non-TTY), stdout is TTY
      await runBrowserInstallCommand(
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: false,
          isStdoutTTY: true,
          writeStderr: () => {},
          installBrowser: async () => ({
            executablePath: "/path/to/chrome",
            buildId: "130.0.0",
            browser: "chrome-headless-shell",
          }),
        },
      );

      const stderrCombined2 = stderrLogs.join("\n");
      const stdoutCombined2 = stdoutLogs.join("\n");
      // Diagnostic on stderr redirected should be plain text
      expect(stderrCombined2.includes("\x1b[")).toBe(false);
      // Result on stdout interactive terminal should be colorized
      expect(stdoutCombined2.includes("\x1b[")).toBe(true);
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
  });

  test("runBrowserInstallCommand reports download progress when isTTY is true", async () => {
    const mockInstalledPath = "/mock/cache/dir/installed-browser";
    const stderrChunks: string[] = [];

    await runBrowserInstallCommand(
      { path: "/mock/cache/dir" },
      {
        isTTY: true,
        writeStderr: (chunk: string) => stderrChunks.push(chunk),
        installBrowser: async (opts) => {
          opts?.onProgress?.(0, 100);
          opts?.onProgress?.(50, 100);
          opts?.onProgress?.(50, 100);
          opts?.onProgress?.(100, 100);
          return {
            executablePath: mockInstalledPath,
            buildId: "130.0.6723.69",
            browser: "chrome-headless-shell",
          };
        },
      },
    );

    const joined = stderrChunks.join("");
    expect(joined).toContain("Downloading chrome-headless-shell: 0%");
    expect(joined).toContain("Downloading chrome-headless-shell: 50%");
    expect(joined).toContain("Downloading chrome-headless-shell: 100%");
    expect(joined).toContain("\n");
  });

  test("runBrowserInstallCommand logs error and exits code 1 on failure", async () => {
    const errLogs: string[] = [];
    const origErr = console.error;
    console.error = (...args: any[]) => errLogs.push(args.join(" "));
    let exitCalledWith: number | undefined;

    try {
      await runBrowserInstallCommand(
        { path: "/mock/cache/dir" },
        {
          exit: (code) => {
            exitCalledWith = code;
          },
          installBrowser: async () => {
            throw new Error("Disk full error");
          },
        },
      );

      expect(exitCalledWith).toBe(1);
      const combinedErrors = errLogs.join("\n");
      expect(combinedErrors).toContain(
        "Failed to install browser: Disk full error",
      );
    } finally {
      console.error = origErr;
    }
  });

  test("runBrowserInstallCommand error logging respects isStderrTTY color formatting", async () => {
    const origErr = console.error;
    const stderrLogs: string[] = [];
    console.error = (...args: any[]) => stderrLogs.push(args.join(" "));
    let exitCode: number | undefined;

    try {
      // With isStderrTTY = false, error message should not contain ANSI colors
      await runBrowserInstallCommand(
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: false,
          exit: (code) => {
            exitCode = code;
          },
          installBrowser: async () => {
            throw new Error("Hermetic failure");
          },
        },
      );
      expect(exitCode).toBe(1);
      expect(
        stderrLogs.some((l) =>
          l.includes("Failed to install browser: Hermetic failure"),
        ),
      ).toBe(true);
      expect(stderrLogs.some((l) => l.includes("\x1b["))).toBe(false);

      stderrLogs.length = 0;
      // With isStderrTTY = true, error message should contain ANSI colors
      await runBrowserInstallCommand(
        { env: { TERM: "xterm-256color" } },
        {
          isStderrTTY: true,
          exit: (code) => {
            exitCode = code;
          },
          installBrowser: async () => {
            throw new Error("Color failure");
          },
        },
      );
      expect(exitCode).toBe(1);
      expect(
        stderrLogs.some((l) =>
          l.includes("Failed to install browser: Color failure"),
        ),
      ).toBe(true);
      expect(stderrLogs.some((l) => l.includes("\x1b["))).toBe(true);
    } finally {
      console.error = origErr;
    }
  });

  test("runBrowserInstallCommand writes newline on failure when isTTY is true", async () => {
    const errLogs: string[] = [];
    const stderrChunks: string[] = [];
    const origErr = console.error;
    console.error = (...args: any[]) => errLogs.push(args.join(" "));
    let exitCalledWith: number | undefined;

    try {
      await runBrowserInstallCommand(
        { path: "/mock/cache/dir" },
        {
          isTTY: true,
          writeStderr: (chunk: string) => stderrChunks.push(chunk),
          exit: (code) => {
            exitCalledWith = code;
          },
          installBrowser: async () => {
            throw new Error("Network timeout");
          },
        },
      );

      expect(exitCalledWith).toBe(1);
      expect(stderrChunks).toContain("\n");
    } finally {
      console.error = origErr;
    }
  });

  test("runBrowserInstallCommand forwards env option to installBrowser", async () => {
    let capturedOptions: any;
    const origErr = console.error;
    console.error = () => {};

    try {
      await runBrowserInstallCommand(
        { path: "/mock/cache/dir", env: { CUSTOM_VAR: "test" } },
        {
          installBrowser: async (opts) => {
            capturedOptions = opts;
            return {
              executablePath: "/mock/cache/dir/chrome",
              buildId: "130.0.0",
              browser: "chrome-headless-shell",
            };
          },
        },
      );
      expect(capturedOptions?.env?.CUSTOM_VAR).toBe("test");
    } finally {
      console.error = origErr;
    }
  });

  test("runBrowserStatusCommand forwards path option as cacheDir to getBrowserStatus", async () => {
    let capturedOptions: any;
    const origLog = console.log;
    const logged: string[] = [];
    console.log = (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    };
    try {
      await runBrowserStatusCommand(
        {
          path: "/custom/cache/dir",
          env: { DEVTOOLS_BROWSERS_DIR: "/custom/env" },
        },
        {
          getBrowserStatus: async (opts) => {
            capturedOptions = opts;
            return {
              found: true,
              path: "/custom/cache/dir/chrome",
              version: "Chrome for Testing 131.0.0",
              source: "managed-cache",
            };
          },
        },
      );
      expect(capturedOptions?.cacheDir).toBe("/custom/cache/dir");
      expect(capturedOptions?.env?.DEVTOOLS_BROWSERS_DIR).toBe("/custom/env");
      const output = logged.join("\n");
      expect(output).toContain("Chromium-compatible browser found:");
      expect(output).toContain("/custom/cache/dir/chrome");
      expect(output).toContain("Chrome for Testing 131.0.0");
      expect(output).toContain("managed-cache");
    } finally {
      console.log = origLog;
    }
  });

  test("runBrowserStatusCommand falls back to process.exit when deps.exit is undefined", async () => {
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => {}) as never,
    );
    try {
      await runBrowserStatusCommand(
        { json: true },
        {
          getBrowserStatus: async () => ({
            found: false,
            code: "BROWSER_NOT_FOUND",
            error: "Not found",
          }),
        },
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  test("runBrowserInstallCommand falls back to process.exit when deps.exit is undefined", async () => {
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => {}) as never,
    );
    const origError = console.error;
    console.error = () => {};
    try {
      await runBrowserInstallCommand(
        {},
        {
          installBrowser: async () => {
            throw new Error("Download failure");
          },
        },
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      console.error = origError;
      exitSpy.mockRestore();
    }
  });

  test("registerBrowserCommands dispatches status and install actions through Commander", async () => {
    const program = new Command();
    program.name("devtools");
    let statusCalledWithOptions: BrowserStatusOptions | undefined;
    let installCalledWithOptions: BrowserInstallOptions | undefined;

    registerBrowserCommands(program, {
      runBrowserStatusCommand: async (opts) => {
        statusCalledWithOptions = opts;
      },
      runBrowserInstallCommand: async (opts) => {
        installCalledWithOptions = opts;
      },
    });

    await program.parseAsync([
      "node",
      "devtools",
      "browser",
      "status",
      "--json",
      "--chrome-path",
      "/custom/chrome",
    ]);
    expect(statusCalledWithOptions?.json).toBe(true);
    expect(statusCalledWithOptions?.chromePath).toBe("/custom/chrome");

    await program.parseAsync([
      "node",
      "devtools",
      "browser",
      "install",
      "--path",
      "/custom/cache",
    ]);
    expect(installCalledWithOptions?.path).toBe("/custom/cache");
  });
});
