import type { ShutdownCoordinator } from "./shutdown";

/**
 * Operating system termination signals handled at the Host Process Boundary.
 */
export type HostSignal = "SIGINT" | "SIGTERM";

/**
 * Injectable signal listener subscription port abstracting Node/Bun `process`.
 */
export interface SignalSourcePort {
  on(event: HostSignal, listener: () => void): unknown;
  off(event: HostSignal, listener: () => void): unknown;
}

/**
 * In-memory {@link SignalSourcePort} for deterministic testing without `process.emit`.
 */
export interface MemorySignalSource extends SignalSourcePort {
  emit(signal: HostSignal): void;
  listenerCount(signal: HostSignal): number;
}

/**
 * Creates a hermetic in-memory {@link MemorySignalSource} for Host Process Boundary tests.
 *
 * @returns Fresh {@link MemorySignalSource} instance.
 */
export function createMemorySignalSource(): MemorySignalSource {
  const listeners: Record<HostSignal, Set<() => void>> = {
    SIGINT: new Set(),
    SIGTERM: new Set(),
  };

  return {
    on(event, listener) {
      listeners[event].add(listener);
    },
    off(event, listener) {
      listeners[event].delete(listener);
    },
    emit(signal) {
      for (const listener of Array.from(listeners[signal])) {
        listener();
      }
    },
    listenerCount(signal) {
      return listeners[signal].size;
    },
  };
}

/**
 * Injectable standard output and standard error port abstracting terminal streams.
 */
export interface OutputPort {
  writeStdout(line: string): void;
  writeStderr(line: string): void;
}

/**
 * In-memory {@link OutputPort} capturing stdout and stderr lines for assertions.
 */
export interface BufferOutput extends OutputPort {
  readonly stdout: string[];
  readonly stderr: string[];
}

/**
 * Creates a buffered {@link OutputPort} capturing emitted lines in memory.
 *
 * @returns Fresh {@link BufferOutput} instance.
 */
export function createBufferOutput(): BufferOutput {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    writeStdout(line) {
      stdout.push(line);
    },
    writeStderr(line) {
      stderr.push(line);
    },
  };
}

/**
 * Creates the default {@link OutputPort} forwarding lines to `console.log` and `console.error`.
 *
 * @returns Console-backed {@link OutputPort}.
 */
export function createConsoleOutput(): OutputPort {
  return {
    writeStdout(line) {
      console.log(line);
    },
    writeStderr(line) {
      console.error(line);
    },
  };
}

/**
 * Injectable process termination callback abstracting `process.exit`.
 */
export type ExitPort = (code: number) => void;

/**
 * Configuration options for binding process termination signals via {@link attachHostSignals}.
 */
export interface AttachHostSignalsOptions {
  /** Coordinator invoked when the first termination signal arrives. */
  coordinator: ShutdownCoordinator;
  /** Signal source port. Defaults to `process`. */
  signals?: SignalSourcePort;
  /** Output port for shutdown diagnostics. Defaults to {@link createConsoleOutput}. */
  output?: OutputPort;
  /** Exit callback invoked after shutdown settles or on force exit. Defaults to `process.exit`. */
  exit?: ExitPort;
  /**
   * Exit code emitted after graceful shutdown succeeds.
   * Defaults to `130` on `SIGINT` and `143` on `SIGTERM`.
   */
  exitCodeOnSignal?: number | ((signal: HostSignal) => number);
  /**
   * Whether a second signal during active graceful shutdown forces immediate exit (`130`/`143`).
   * @defaultValue true
   */
  forceExitOnSecondSignal?: boolean;
  /**
   * Optional formatter for the diagnostic line written to stderr on the first signal.
   * Return `null` to suppress the message.
   */
  formatFirstSignalMessage?: (signal: HostSignal) => string | null;
  /** Optional formatter for error messages when graceful shutdown rejects. */
  formatErrorMessage?: (err: unknown) => string;
}

function defaultSignalExitCode(signal: HostSignal): number {
  return signal === "SIGTERM" ? 143 : 130;
}

/**
 * Attaches `SIGINT` and `SIGTERM` listeners at the Host Process Boundary to drive
 * 3-phase graceful shutdown, with second-signal force exit and test-safe detachment.
 *
 * @param options - Coordinator and injectable host boundary ports.
 * @returns Handle with an idempotent `detach()` method removing registered listeners.
 */
export function attachHostSignals(options: AttachHostSignalsOptions): {
  detach(): void;
} {
  const signalSource: SignalSourcePort = options.signals ?? process;
  const output: OutputPort = options.output ?? createConsoleOutput();
  const exit: ExitPort = options.exit ?? ((code) => process.exit(code));
  const forceOnSecond = options.forceExitOnSecondSignal !== false;

  let shuttingDown = false;
  let detached = false;

  const detach = (): void => {
    if (detached) return;
    detached = true;
    signalSource.off("SIGINT", onSigint);
    signalSource.off("SIGTERM", onSigterm);
  };

  const handleSignal = (signal: HostSignal): void => {
    if (shuttingDown) {
      if (forceOnSecond) {
        exit(defaultSignalExitCode(signal));
      }
      return;
    }

    shuttingDown = true;

    const firstMessage = options.formatFirstSignalMessage
      ? options.formatFirstSignalMessage(signal)
      : `Received ${signal}. Shutting down...`;
    if (firstMessage !== null) {
      output.writeStderr(firstMessage);
    }

    const resolvedExitCode =
      typeof options.exitCodeOnSignal === "function"
        ? options.exitCodeOnSignal(signal)
        : (options.exitCodeOnSignal ?? defaultSignalExitCode(signal));

    void (async () => {
      try {
        await options.coordinator.shutdown(signal);
        detach();
        exit(resolvedExitCode);
      } catch (err: unknown) {
        detach();
        const errMessage = options.formatErrorMessage
          ? options.formatErrorMessage(err)
          : `Failed to shut down cleanly: ${err instanceof Error ? err.message : String(err)}`;
        output.writeStderr(errMessage);
        exit(1);
      }
    })();
  };

  const onSigint = () => handleSignal("SIGINT");
  const onSigterm = () => handleSignal("SIGTERM");

  signalSource.on("SIGINT", onSigint);
  signalSource.on("SIGTERM", onSigterm);

  return { detach };
}
