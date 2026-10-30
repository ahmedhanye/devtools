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
   */
  constructor(message: string) {
    super(message);
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
   */
  constructor(message: string) {
    super(message);
    this.name = "LighthouseExecutionError";
  }
}
