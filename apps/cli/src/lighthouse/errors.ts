/**
 * Domain errors re-exported from `@devtools/lighthouse` and CLI-specific command errors.
 */
export {
  AmbiguousRunIdError,
  LighthouseRunNotFoundError,
} from "@devtools/lighthouse";

/**
 * Error thrown when a performance budget rule fails parsing or validation.
 */
export class InvalidBudgetRuleError extends Error {
  /** Suggested CLI exit code (`1`) when this error terminates a command. */
  // fallow-ignore-next-line unused-class-member
  readonly exitCode = 1;
  /** Machine-readable error code (`"INVALID_BUDGET_RULE"`). */
  // fallow-ignore-next-line unused-class-member
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
