/**
 * Error thrown when caller-supplied Lighthouse audit options (`url`, `runs`, `formFactor`,
 * or `throttlingMethod`) are invalid.
 */
export class InvalidAuditOptionsError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  readonly exitCode = 1;
  /** Machine-readable error code (`"INVALID_AUDIT_OPTIONS"`). */
  readonly code = "INVALID_AUDIT_OPTIONS" as const;

  /**
   * Creates a new {@link InvalidAuditOptionsError}.
   *
   * @param message - Actionable diagnostic message explaining which option is invalid.
   * @param options - Optional native error options including error cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidAuditOptionsError";
  }
}

/**
 * Error thrown when an isolated Lighthouse worker subprocess exits with a failure
 * or fails to produce a valid LHR result.
 */
export class LighthouseExecutionError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  readonly exitCode = 1;
  /** Machine-readable error code (`"LIGHTHOUSE_EXECUTION_ERROR"`). */
  readonly code = "LIGHTHOUSE_EXECUTION_ERROR" as const;

  /**
   * Creates a new {@link LighthouseExecutionError}.
   *
   * @param message - Diagnostic explanation of the worker or Lighthouse runtime failure.
   * @param options - Optional native error options including error cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LighthouseExecutionError";
  }
}

/**
 * Error thrown when attempting to compute a representative run from an empty runs array.
 */
export class EmptyRunsError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  readonly exitCode = 1;
  /** Machine-readable error code (`"EMPTY_RUNS"`). */
  readonly code = "EMPTY_RUNS" as const;

  /**
   * Creates a new {@link EmptyRunsError}.
   *
   * @param message - Diagnostic explanation of the empty runs input.
   * @param options - Optional native error options including error cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EmptyRunsError";
  }
}

/**
 * Error thrown inside the worker subprocess when Chromium resolution, Chrome launch,
 * or Lighthouse audit execution fails.
 */
export class WorkerExecutionError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  readonly exitCode = 1;
  /** Machine-readable error code (`"WORKER_EXECUTION_ERROR"`). */
  readonly code = "WORKER_EXECUTION_ERROR" as const;

  /**
   * Creates a new {@link WorkerExecutionError}.
   *
   * @param message - Diagnostic explanation of the worker failure.
   * @param options - Optional native error options including error cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WorkerExecutionError";
  }
}

/**
 * Error thrown when an audit run cannot be resolved by ID or when no runs exist.
 */
export class LighthouseRunNotFoundError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  readonly exitCode = 1;
  /** Machine-readable error code (`"LIGHTHOUSE_RUN_NOT_FOUND"`). */
  readonly code = "LIGHTHOUSE_RUN_NOT_FOUND" as const;

  /**
   * Creates a new {@link LighthouseRunNotFoundError}.
   *
   * @param message - Diagnostic message explaining which ID or query resolved to no runs.
   * @param options - Optional native error options including error cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LighthouseRunNotFoundError";
  }
}

/**
 * Error thrown when a run ID prefix is ambiguous because it matches multiple historical records.
 */
export class AmbiguousRunIdError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  readonly exitCode = 1;
  /** Machine-readable error code (`"AMBIGUOUS_RUN_ID"`). */
  readonly code = "AMBIGUOUS_RUN_ID" as const;

  /**
   * Creates a new {@link AmbiguousRunIdError}.
   *
   * @param message - Diagnostic message describing the prefix and candidate matches.
   * @param options - Optional native error options including error cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AmbiguousRunIdError";
  }
}

/**
 * Error thrown when an active Lighthouse audit is cancelled via an `AbortSignal`.
 */
export class AuditCancelledError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  readonly exitCode = 1;
  /** Machine-readable error code (`"AUDIT_CANCELLED"`). */
  readonly code = "AUDIT_CANCELLED" as const;

  /**
   * Creates a new {@link AuditCancelledError}.
   *
   * @param message - Diagnostic explanation of the cancellation.
   * @param options - Optional native error options including cancellation `cause`.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuditCancelledError";
  }
}
