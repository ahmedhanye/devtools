import { describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  attachHostSignals,
  createBufferOutput,
  createConsoleOutput,
  createMemorySignalSource,
  createTeardown,
  findWorkspaceRoot,
  isStandaloneRuntime,
} from "../src/node";

describe("@devtools/core/node workspace utilities", () => {
  it("findWorkspaceRoot resolves monorepo root from cwd and nested subdirectories", () => {
    const repoRoot = resolve(import.meta.dir, "../../..");
    expect(findWorkspaceRoot()).toBe(repoRoot);
    expect(findWorkspaceRoot(import.meta.dir)).toBe(repoRoot);
  });

  it("findWorkspaceRoot handles malformed package.json, single markers, and returns null outside a workspace", () => {
    const baseDir = join(tmpdir(), `devtools-core-isolated-${Date.now()}`);
    const malformedDir = join(baseDir, "malformed");
    const gitOnlyDir = join(baseDir, "git-only");
    const gitOnlySub = join(gitOnlyDir, "nested");
    const pkgOnlyDir = join(baseDir, "pkg-only");
    const pkgOnlySub = join(pkgOnlyDir, "nested");
    mkdirSync(malformedDir, { recursive: true });
    mkdirSync(join(gitOnlyDir, ".git"), { recursive: true });
    mkdirSync(gitOnlySub, { recursive: true });
    mkdirSync(pkgOnlySub, { recursive: true });
    writeFileSync(join(malformedDir, "package.json"), "{ invalid json");
    writeFileSync(
      join(pkgOnlyDir, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    try {
      expect(findWorkspaceRoot(malformedDir)).toBeNull();
      expect(findWorkspaceRoot(gitOnlySub)).toBe(gitOnlyDir);
      expect(findWorkspaceRoot(pkgOnlySub)).toBe(pkgOnlyDir);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it("isStandaloneRuntime honors explicit override and falls back to Bun.isStandaloneExecutable", () => {
    expect(isStandaloneRuntime(true)).toBe(true);
    expect(isStandaloneRuntime(false)).toBe(false);
    expect(isStandaloneRuntime()).toBe(Bun.isStandaloneExecutable);
  });
});

describe("createTeardown (Scoped LIFO Teardown)", () => {
  it("aborts signal, executes deferred steps in strict LIFO order, and is idempotent", async () => {
    const teardown = createTeardown();
    const order: string[] = [];

    expect(teardown.isShuttingDown).toBe(false);
    expect(teardown.signal.aborted).toBe(false);

    teardown.defer(() => {
      order.push("db-close");
    });
    teardown.defer(async () => {
      await Bun.sleep(5);
      order.push("work-abort");
    });
    teardown.defer(() => {
      expect(teardown.signal.aborted).toBe(true);
      order.push("http-stop");
    });

    const p1 = teardown.run("SIGINT");
    const p2 = teardown.run("SIGTERM");
    expect(p1).toBe(p2);
    expect(teardown.isShuttingDown).toBe(true);
    expect(teardown.signal.aborted).toBe(true);
    expect(teardown.signal.reason).toBe("SIGINT");

    await p1;
    expect(order).toEqual(["http-stop", "work-abort", "db-close"]);
  });

  it("returns an idempotent unregister function scoped to the exact registration", async () => {
    const teardown = createTeardown();
    const calls: string[] = [];

    const sharedFn = () => {
      calls.push("shared");
    };
    const removeFirst = teardown.defer(sharedFn);
    teardown.defer(sharedFn);
    const removeSkipped = teardown.defer(() => {
      calls.push("skipped");
    });

    removeSkipped();
    removeSkipped();
    removeFirst();
    removeFirst();

    await teardown.run();
    expect(calls).toEqual(["shared"]);
  });

  it("executes all remaining LIFO steps when earlier steps reject and rethrows the first error", async () => {
    const teardown = createTeardown();
    const order: string[] = [];

    teardown.defer(() => {
      order.push("db-close");
    });
    teardown.defer(async () => {
      order.push("work-abort");
      throw new Error("work failure");
    });
    teardown.defer(() => {
      order.push("http-stop");
      throw new Error("http failure");
    });

    await expect(teardown.run()).rejects.toThrow("http failure");
    expect(order).toEqual(["http-stop", "work-abort", "db-close"]);
    expect(teardown.signal.reason).toBeInstanceOf(Error);
    expect((teardown.signal.reason as Error).message).toBe(
      "Shutdown requested",
    );
  });

  it("ignores unregister() called inside an executing step while earlier steps remain queued, supports re-entrant defer(), and ignores defer() after run() settles", async () => {
    const teardown = createTeardown();
    const order: string[] = [];

    teardown.defer(() => {
      order.push("step-1");
    });

    let removeStep2!: () => void;
    removeStep2 = teardown.defer(() => {
      // step-2 has already been popped; calling removeStep2() must NOT splice step-1
      removeStep2();
      teardown.defer(() => {
        order.push("reentrant-step-3");
      });
      order.push("step-2");
    });

    await teardown.run();
    expect(order).toEqual(["step-2", "reentrant-step-3", "step-1"]);

    let lateRan = false;
    teardown.defer(() => {
      lateRan = true;
    });
    await teardown.run();
    expect(lateRan).toBe(false);
  });
});

describe("Host Process Boundary Signal & Output Ports", () => {
  it("handles 1st signal gracefully, forces exit on 2nd signal, and detaches listeners cleanly", async () => {
    const signals = createMemorySignalSource();
    const output = createBufferOutput();
    const teardown = createTeardown();
    const exitCodes: number[] = [];

    let releaseWork!: () => void;
    const workGate = new Promise<void>((res) => {
      releaseWork = res;
    });
    teardown.defer(async () => {
      await workGate;
    });

    const handle = attachHostSignals({
      onShutdown: (sig) => teardown.run(sig),
      signals,
      output,
      exit: (code) => {
        exitCodes.push(code);
      },
      exitCodeOnSignal: 0,
      formatFirstSignalMessage: (sig) => `Graceful ${sig}`,
    });

    expect(signals.listenerCount("SIGINT")).toBe(1);
    expect(signals.listenerCount("SIGTERM")).toBe(1);

    // 1st SIGINT starts graceful shutdown
    signals.emit("SIGINT");
    output.writeStdout("shutdown-started");
    expect(output.stdout).toEqual(["shutdown-started"]);
    expect(output.stderr).toEqual(["Graceful SIGINT"]);
    expect(teardown.isShuttingDown).toBe(true);
    expect(exitCodes).toEqual([]);

    // 2nd SIGINT forces immediate exit 130
    signals.emit("SIGINT");
    expect(exitCodes).toEqual([130]);

    // 2nd SIGTERM forces immediate exit 143 while shutdown still pending
    signals.emit("SIGTERM");
    expect(exitCodes).toEqual([130, 143]);

    // Completing graceful shutdown detaches listeners and calls exitCodeOnSignal (0)
    releaseWork();
    await Bun.sleep(10);
    expect(exitCodes).toEqual([130, 143, 0]);
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);

    // Detach is idempotent
    handle.detach();
  });

  it("supports suppressed second-signal force exit, null message suppression, and shutdown error exit 1", async () => {
    const signals = createMemorySignalSource();
    const output = createBufferOutput();
    const teardown = createTeardown();
    const exitCodes: number[] = [];

    let releaseWork!: () => void;
    const workGate = new Promise<void>((res) => {
      releaseWork = res;
    });
    teardown.defer(async () => {
      await workGate;
      throw new Error("cleanup boom");
    });

    attachHostSignals({
      onShutdown: (sig) => teardown.run(sig),
      signals,
      output,
      exit: (code) => {
        exitCodes.push(code);
      },
      forceExitOnSecondSignal: false,
      formatFirstSignalMessage: () => null,
      formatErrorMessage: (err) => `Custom err: ${(err as Error).message}`,
    });

    signals.emit("SIGTERM");
    signals.emit("SIGTERM");
    expect(output.stderr).toEqual([]);
    expect(exitCodes).toEqual([]);

    releaseWork();
    await Bun.sleep(10);
    expect(output.stderr).toEqual(["Custom err: cleanup boom"]);
    expect(exitCodes).toEqual([1]);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });

  it("uses default signal exit codes, default messages, and exercises default process/console seams", async () => {
    const signals = createMemorySignalSource();
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => {}) as never,
    );

    try {
      const consoleOut = createConsoleOutput();
      consoleOut.writeStdout("stdout line");
      consoleOut.writeStderr("stderr line");
      expect(logSpy).toHaveBeenCalledWith("stdout line");
      expect(errSpy).toHaveBeenCalledWith("stderr line");

      // Default message + default exitCodeOnSignal (SIGTERM -> 143) + default output/exit
      attachHostSignals({
        onShutdown: () => {},
        signals,
      });
      signals.emit("SIGTERM");
      await Bun.sleep(10);
      expect(errSpy).toHaveBeenCalledWith("Received SIGTERM. Shutting down...");
      expect(exitSpy).toHaveBeenCalledWith(143);

      // Default error formatting with Error instance & function exitCodeOnSignal
      const fnExitCodes: number[] = [];
      const errSignals = createMemorySignalSource();
      attachHostSignals({
        onShutdown: () => Promise.reject(new Error("boom")),
        signals: errSignals,
        exitCodeOnSignal: (sig) => (sig === "SIGTERM" ? 2 : 3),
      });
      errSignals.emit("SIGINT");
      await Bun.sleep(10);
      expect(errSpy).toHaveBeenCalledWith("Failed to shut down cleanly: boom");
      expect(exitSpy).toHaveBeenCalledWith(1);

      const fnSignals = createMemorySignalSource();
      attachHostSignals({
        onShutdown: () => {},
        signals: fnSignals,
        exit: (code) => {
          fnExitCodes.push(code);
        },
        exitCodeOnSignal: (sig) => (sig === "SIGTERM" ? 2 : 3),
      });
      fnSignals.emit("SIGTERM");
      await Bun.sleep(10);
      expect(fnExitCodes).toEqual([2]);

      // Default error formatting with non-Error rejection
      const sigintSignals = createMemorySignalSource();
      attachHostSignals({
        onShutdown: () => Promise.reject("raw failure"),
        signals: sigintSignals,
      });
      sigintSignals.emit("SIGINT");
      await Bun.sleep(10);
      expect(errSpy).toHaveBeenCalledWith(
        "Failed to shut down cleanly: raw failure",
      );
      expect(exitSpy).toHaveBeenCalledWith(1);

      // Default process signal source attaches and detaches without leaking listeners
      const beforeInt = process.listenerCount("SIGINT");
      const beforeTerm = process.listenerCount("SIGTERM");
      const procHandle = attachHostSignals({
        onShutdown: () => {},
      });
      expect(process.listenerCount("SIGINT")).toBe(beforeInt + 1);
      expect(process.listenerCount("SIGTERM")).toBe(beforeTerm + 1);
      procHandle.detach();
      expect(process.listenerCount("SIGINT")).toBe(beforeInt);
      expect(process.listenerCount("SIGTERM")).toBe(beforeTerm);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});
