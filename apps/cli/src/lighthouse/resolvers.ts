import {
  desc,
  eq,
  like,
  lighthouseRuns,
  type DevtoolsDb,
  type LighthouseRunRow,
} from "@devtools/db";
import { AmbiguousRunIdError, LighthouseRunNotFoundError } from "./errors";

/**
 * Minimum character length permitted for short-UUID prefix lookups.
 */
export const MIN_PREFIX_LENGTH = 6;

/**
 * Resolves a Lighthouse run by full UUID or unique short-ID prefix against SQLite.
 *
 * @param db - Active {@link DevtoolsDb} instance.
 * @param idOrPrefix - Full ID or prefix (minimum 6 characters).
 * @returns Matching {@link LighthouseRunRow}.
 * @throws {@link LighthouseRunNotFoundError} If prefix is too short or run is not found.
 * @throws {@link AmbiguousRunIdError} If prefix matches multiple records.
 */
export function resolveRunId(
  db: DevtoolsDb,
  idOrPrefix: string,
): LighthouseRunRow {
  const query = idOrPrefix.trim();

  // Try exact lookup first
  const exact = db
    .select()
    .from(lighthouseRuns)
    .where(eq(lighthouseRuns.id, query))
    .get();

  if (exact) {
    return exact;
  }

  // Enforce prefix length for non-exact matches
  if (query.length < MIN_PREFIX_LENGTH) {
    throw new LighthouseRunNotFoundError(
      `Run ID prefix "${query}" is too short. Minimum ${MIN_PREFIX_LENGTH} characters required for prefix lookup.`,
    );
  }

  const matches = db
    .select()
    .from(lighthouseRuns)
    .where(like(lighthouseRuns.id, `${query}%`))
    .all();

  if (matches.length === 0) {
    throw new LighthouseRunNotFoundError(`Audit run "${query}" not found.`);
  }

  if (matches.length > 1) {
    const candidateIds = matches.map((m) => m.id).join(", ");
    throw new AmbiguousRunIdError(
      `Ambiguous run ID prefix "${query}". Matches multiple runs: [${candidateIds}]. Specify more characters to disambiguate.`,
    );
  }

  return matches[0]!;
}

/**
 * Resolves the single most recent Lighthouse audit run recorded in SQLite.
 *
 * @param db - Active {@link DevtoolsDb} instance.
 * @returns Most recent {@link LighthouseRunRow}.
 * @throws {@link LighthouseRunNotFoundError} If no audit runs have been recorded yet.
 */
export function resolveLatestRun(db: DevtoolsDb): LighthouseRunRow {
  const row = db
    .select()
    .from(lighthouseRuns)
    .orderBy(desc(lighthouseRuns.createdAt))
    .limit(1)
    .get();

  if (!row) {
    throw new LighthouseRunNotFoundError(
      "No audit runs found. Run 'devtools lighthouse <url>' first.",
    );
  }

  return row;
}
