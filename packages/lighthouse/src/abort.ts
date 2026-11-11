import { AuditCancelledError } from "./errors";

/**
 * Throws {@link AuditCancelledError} if the provided `AbortSignal` has already aborted.
 *
 * @param signal - Optional cancellation signal to inspect.
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new AuditCancelledError("Lighthouse audit was cancelled", {
      cause: signal.reason,
    });
  }
}
