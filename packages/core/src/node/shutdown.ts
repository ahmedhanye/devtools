/**
 * Ordered teardown phases coordinated during process shutdown.
 *
 * - `"ingress"`: Stop accepting new external requests (HTTP server, SSE streams).
 * - `"work"`: Abort active background tasks and await child process cleanup (e.g. Chrome).
 * - `"persistence"`: Flush and close database connections (SQLite WAL checkpoint + close).
 */
export type ShutdownPhase = "ingress" | "work" | "persistence";

/**
 * Canonical phase execution order during graceful shutdown.
 */
export const SHUTDOWN_PHASES: readonly ShutdownPhase[] = [
  "ingress",
  "work",
  "persistence",
] as const;

/**
 * Callback invoked during its registered {@link ShutdownPhase}.
 *
 * @param signal - The coordinator's aborted `AbortSignal`.
 */
export type ShutdownHook = (signal: AbortSignal) => void | Promise<void>;

/**
 * Optional registration metadata for {@link ShutdownRegistry.register}.
 */
export interface ShutdownRegisterOptions {
  /**
   * Optional stable identifier used to deduplicate or replace an earlier hook
   * within the same phase (for example, `"db:/path/to/devtools.db"`).
   */
  id?: string;
}

/**
 * Downward capability port exposed to feature packages and persistence modules.
 *
 * @remarks
 * Allows packages to observe cancellation (`signal`) and register phase-ordered
 * cleanup hooks without exposing `shutdown()` control to lower layers.
 */
export interface ShutdownRegistry {
  /** Cancellation signal aborted immediately when {@link ShutdownCoordinator.shutdown} starts. */
  readonly signal: AbortSignal;
  /** Whether shutdown has been initiated on this coordinator. */
  readonly isShuttingDown: boolean;
  /**
   * Registers a cleanup hook in the given teardown phase.
   *
   * @param phase - Target shutdown phase (`"ingress"`, `"work"`, or `"persistence"`).
   * @param hook - Synchronous or asynchronous cleanup callback.
   * @param options - Optional deduplication identifier (`id`).
   * @returns Idempotent unregister function removing this exact registration.
   */
  register(
    phase: ShutdownPhase,
    hook: ShutdownHook,
    options?: ShutdownRegisterOptions,
  ): () => void;
}

/**
 * Process-level coordinator controlling 3-phase graceful shutdown and downward `AbortSignal`.
 */
export interface ShutdownCoordinator extends ShutdownRegistry {
  /**
   * Aborts `signal` and runs registered hooks sequentially across `"ingress"`, `"work"`,
   * and `"persistence"`. Idempotent across concurrent or repeated invocations.
   *
   * @param reason - Optional abort reason passed to `AbortController.abort`.
   * @throws {unknown} Rethrows the first hook error after all three phases finish settling.
   */
  shutdown(reason?: unknown): Promise<void>;
  /**
   * Clears registered hooks and resets `signal` / `isShuttingDown` for isolated testing.
   */
  resetForTesting(): void;
}

interface HookEntry {
  readonly hook: ShutdownHook;
}

/**
 * Creates an isolated 3-phase {@link ShutdownCoordinator}.
 *
 * @returns Fresh {@link ShutdownCoordinator} instance.
 */
export function createShutdownCoordinator(): ShutdownCoordinator {
  let controller = new AbortController();
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;

  const phases: Record<ShutdownPhase, Map<string | symbol, HookEntry>> = {
    ingress: new Map(),
    work: new Map(),
    persistence: new Map(),
  };

  async function runPhase(phase: ShutdownPhase): Promise<unknown[]> {
    const phaseMap = phases[phase];
    const entries = Array.from(phaseMap.values());
    if (entries.length === 0) {
      return [];
    }

    const results = await Promise.allSettled(
      entries.map((entry) =>
        Promise.resolve().then(() => entry.hook(controller.signal)),
      ),
    );

    const errors: unknown[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        errors.push(result.reason);
      }
    }
    return errors;
  }

  return {
    get signal() {
      return controller.signal;
    },

    get isShuttingDown() {
      return shuttingDown;
    },

    register(phase, hook, options) {
      const key: string | symbol = options?.id ?? Symbol("shutdown-hook");
      const entry: HookEntry = { hook };
      phases[phase].set(key, entry);

      let unregistered = false;
      return () => {
        if (unregistered) return;
        unregistered = true;
        if (phases[phase].get(key) === entry) {
          phases[phase].delete(key);
        }
      };
    },

    shutdown(reason) {
      if (shutdownPromise) {
        return shutdownPromise;
      }
      shuttingDown = true;
      controller.abort(reason ?? new Error("Process shutdown requested"));

      shutdownPromise = (async () => {
        const ingressErrors = await runPhase("ingress");
        const workErrors = await runPhase("work");
        const persistenceErrors = await runPhase("persistence");
        const errors = [...ingressErrors, ...workErrors, ...persistenceErrors];
        if (errors.length > 0) {
          throw errors[0];
        }
      })();

      return shutdownPromise;
    },

    resetForTesting() {
      controller = new AbortController();
      shuttingDown = false;
      shutdownPromise = null;
      phases.ingress.clear();
      phases.work.clear();
      phases.persistence.clear();
    },
  };
}

/**
 * Default process-wide {@link ShutdownCoordinator} shared across host boundaries.
 */
export const hostShutdown: ShutdownCoordinator = createShutdownCoordinator();
