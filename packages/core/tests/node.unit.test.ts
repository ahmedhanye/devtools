import { describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  SHUTDOWN_PHASES,
  attachHostSignals,
  createBufferOutput,
  createConsoleOutput,
  createMemorySignalSource,
  createShutdownCoordinator,
  findWorkspaceRoot,
  hostShutdown,
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

describe("ShutdownCoordinator & ShutdownRegistry", () => {
  it("executes phases strictly in ingress -> work -> persistence order including lazy Phase 3 hooks", async () => {
    const coordinator = createShutdownCoordinator();
    const order: string[] = [];

    expect(SHUTDOWN_PHASES).toEqual(["ingress", "work", "persistence"]);
    expect(coordinator.isShuttingDown).toBe(false);
    expect(coordinator.signal.aborted).toBe(false);

    coordinator.register("ingress", async (sig) => {
      expect(sig.aborted).toBe(true);
      order.push("ingress-1");
      // Lazy Phase 3 registration during Phase 1 must run in Phase 3
      coordinator.register("persistence", () => {
        order.push("persistence-lazy");
      });
    });

    coordinator.register("work", async () => {
      await Bun.sleep(5);
      order.push("work-1");
      coordinator.register("persistence", () => {
        order.push("persistence-from-work");
      });
    });

    coordinator.register("persistence", () => {
      order.push("persistence-initial");
    });

    const p1 = coordinator.shutdown("SIGINT");
    const p2 = coordinator.shutdown("SIGTERM");
    expect(p1).toBe(p2);
    expect(coordinator.isShuttingDown).toBe(true);
    expect(coordinator.signal.aborted).toBe(true);
    expect(coordinator.signal.reason).toBe("SIGINT");

    await p1;
    expect(order).toEqual([
      "ingress-1",
      "work-1",
      "persistence-initial",
      "persistence-lazy",
      "persistence-from-work",
    ]);

    coordinator.resetForTesting();
    expect(coordinator.isShuttingDown).toBe(false);
    expect(coordinator.signal.aborted).toBe(false);
  });

  it("deduplicates hooks by id and keeps unregister idempotent and safe after replacement", async () => {
    const coordinator = createShutdownCoordinator();
    const calls: string[] = [];

    const unregFirst = coordinator.register(
      "work",
      () => {
        calls.push("first");
      },
      { id: "shared-id" },
    );
    const unregSecond = coordinator.register(
      "work",
      () => {
        calls.push("second");
      },
      { id: "shared-id" },
    );

    // Calling stale unregister must not remove the replacement hook
    unregFirst();
    unregFirst();

    const unregRemoved = coordinator.register("ingress", () => {
      calls.push("removed");
    });
    unregRemoved();

    await coordinator.shutdown();
    expect(calls).toEqual(["second"]);

    // Subsequent unregister of replacement hook clears cleanly on reset
    unregSecond();
    coordinator.resetForTesting();
    await coordinator.shutdown();
    expect(calls).toEqual(["second"]);
  });

  it("runs all three phases even when earlier phases reject and rethrows the first error", async () => {
    const coordinator = createShutdownCoordinator();
    const order: string[] = [];

    coordinator.register("ingress", () => {
      order.push("ingress");
      throw new Error("ingress failure");
    });
    coordinator.register("work", async () => {
      order.push("work");
      throw new Error("work failure");
    });
    coordinator.register("persistence", () => {
      order.push("persistence");
    });

    await expect(coordinator.shutdown()).rejects.toThrow("ingress failure");
    expect(order).toEqual(["ingress", "work", "persistence"]);
    expect(coordinator.signal.reason).toBeInstanceOf(Error);
    expect((coordinator.signal.reason as Error).message).toBe(
      "Process shutdown requested",
    );

    // Exposes process-default hostShutdown coordinator
    expect(hostShutdown.signal.aborted).toBe(false);
  });
});

describe("Host Process Boundary Signal & Output Ports", () => {
  it("handles 1st signal gracefully, forces exit on 2nd signal, and detaches listeners cleanly", async () => {
    const signals = createMemorySignalSource();
    const output = createBufferOutput();
    const coordinator = createShutdownCoordinator();
    const exitCodes: number[] = [];

    let releaseWork!: () => void;
    const workGate = new Promise<void>((res) => {
      releaseWork = res;
    });
    coordinator.register("work", async () => {
      await workGate;
    });

    const handle = attachHostSignals({
      coordinator,
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
    expect(coordinator.isShuttingDown).toBe(true);
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
    const coordinator = createShutdownCoordinator();
    const exitCodes: number[] = [];

    let releaseWork!: () => void;
    const workGate = new Promise<void>((res) => {
      releaseWork = res;
    });
    coordinator.register("work", async () => {
      await workGate;
      throw new Error("cleanup boom");
    });

    attachHostSignals({
      coordinator,
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
    const coordinator = createShutdownCoordinator();
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
        coordinator,
        signals,
      });
      signals.emit("SIGTERM");
      await Bun.sleep(10);
      expect(errSpy).toHaveBeenCalledWith("Received SIGTERM. Shutting down...");
      expect(exitSpy).toHaveBeenCalledWith(143);

      // Default error formatting with Error instance & function exitCodeOnSignal
      coordinator.resetForTesting();
      coordinator.register("work", () => Promise.reject(new Error("boom")));
      const fnExitCodes: number[] = [];
      const errSignals = createMemorySignalSource();
      attachHostSignals({
        coordinator,
        signals: errSignals,
        exitCodeOnSignal: (sig) => (sig === "SIGTERM" ? 2 : 3),
      });
      errSignals.emit("SIGINT");
      await Bun.sleep(10);
      expect(errSpy).toHaveBeenCalledWith("Failed to shut down cleanly: boom");
      expect(exitSpy).toHaveBeenCalledWith(1);

      coordinator.resetForTesting();
      const fnSignals = createMemorySignalSource();
      attachHostSignals({
        coordinator,
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
      coordinator.resetForTesting();
      coordinator.register("work", () => Promise.reject("raw failure"));
      const sigintSignals = createMemorySignalSource();
      attachHostSignals({
        coordinator,
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
        coordinator: createShutdownCoordinator(),
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
