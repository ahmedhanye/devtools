/**
 * Synchronous or asynchronous cleanup callback deferred on a {@link Teardown} scope.
 */
export type CleanupStep = () => void | Promise<void>;

/**
 * Scoped LIFO teardown helper coordinating downward cancellation (`signal`) and
 * deterministic reverse-order cleanup without global singletons or phase registries.
 */
export interface Teardown {
  /** Cancellation signal aborted immediately when {@link Teardown.run} starts. */
  readonly signal: AbortSignal;
  /** Whether {@link Teardown.run} has been initiated. */
  readonly isShuttingDown: boolean;
  /**
   * Registers a cleanup step executed in LIFO (reverse-registration) order.
   *
   * @param step - Synchronous or asynchronous cleanup callback.
   * @returns Idempotent unregister function removing this exact registration.
   */
  defer(step: CleanupStep): () => void;
  /**
   * Aborts `signal` and executes all deferred steps sequentially in LIFO order.
   * Idempotent across concurrent or repeated invocations; runs all steps before rethrowing the first error.
   *
   * @param reason - Optional abort reason passed to `AbortController.abort`.
   * @throws {unknown} Rethrows the first error thrown by any cleanup step.
   */
  run(reason?: unknown): Promise<void>;
}

interface DeferredEntry {
  readonly step: CleanupStep;
}

/**
 * Creates an isolated scoped LIFO {@link Teardown} helper.
 *
 * @returns Fresh {@link Teardown} instance.
 */
export function createTeardown(): Teardown {
  const controller = new AbortController();
  const entries: DeferredEntry[] = [];
  let runPromise: Promise<void> | null = null;

  return {
    get signal() {
      return controller.signal;
    },

    get isShuttingDown() {
      return runPromise !== null;
    },

    defer(step) {
      const entry: DeferredEntry = { step };
      entries.push(entry);
      let removed = false;
      return () => {
        if (removed) {
          return;
        }
        removed = true;
        const idx = entries.indexOf(entry);
        if (idx !== -1) {
          entries.splice(idx, 1);
        }
      };
    },

    run(reason) {
      if (runPromise) {
        return runPromise;
      }
      controller.abort(reason ?? new Error("Shutdown requested"));
      runPromise = (async () => {
        let firstError: unknown;
        let hasError = false;
        for (
          let entry = entries.pop();
          entry !== undefined;
          entry = entries.pop()
        ) {
          try {
            // oxlint-disable-next-line no-await-in-loop -- LIFO teardown steps settle sequentially in reverse registration order
            await entry.step();
          } catch (err: unknown) {
            if (!hasError) {
              firstError = err;
              hasError = true;
            }
          }
        }
        if (hasError) {
          throw firstError;
        }
      })();
      return runPromise;
    },
  };
}
