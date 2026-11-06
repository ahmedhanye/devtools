/**
 * Short-UUID and latest run resolution utilities for Lighthouse audit records.
 *
 * @remarks
 * Delegates directly to the domain repository in `@devtools/lighthouse` with zero raw database queries in CLI.
 */
import {
  getLatestLighthouseRun,
  MIN_PREFIX_LENGTH,
  resolveLighthouseRun,
} from "@devtools/lighthouse";

// fallow-ignore-next-line unused-export
export { MIN_PREFIX_LENGTH, resolveLighthouseRun, getLatestLighthouseRun };

/**
 * Resolves a Lighthouse run by full UUID or unique short-ID prefix against SQLite.
 *
 * @deprecated Use {@link resolveLighthouseRun} from `@devtools/lighthouse`.
 */
export const resolveRunId = resolveLighthouseRun;

/**
 * Resolves the single most recent Lighthouse audit run recorded in SQLite.
 *
 * @deprecated Use {@link getLatestLighthouseRun} from `@devtools/lighthouse`.
 */
export const resolveLatestRun = getLatestLighthouseRun;
