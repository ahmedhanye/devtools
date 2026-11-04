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
 * Error thrown when a performance budget rule fails parsing or validation.
 */
export class InvalidBudgetRuleError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  readonly exitCode = 1;
  /** Machine-readable error code (`"INVALID_BUDGET_RULE"`). */
  readonly code = "INVALID_BUDGET_RULE" as const;

  /**
   * Creates a new {@link InvalidBudgetRuleError}.
   *
   * @param message - Actionable message explaining why the budget rule string is invalid.
   * @param options - Optional native error options including error cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidBudgetRuleError";
  }
}

/**
 * Error thrown when spawning the system viewer to open an HTML report fails.
 */
export class LighthouseOpenerError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  readonly exitCode = 1;
  /** Machine-readable error code (`"LIGHTHOUSE_OPENER_ERROR"`). */
  readonly code = "LIGHTHOUSE_OPENER_ERROR" as const;

  /**
   * Creates a new {@link LighthouseOpenerError}.
   *
   * @param message - Diagnostic message detailing the spawn failure.
   * @param options - Optional native error options including error cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LighthouseOpenerError";
  }
}
