import {
  and,
  desc,
  eq,
  lighthouseRuns,
  ne,
  sql,
  type DevtoolsDb,
  type LighthouseRunRow,
  type NewLighthouseRunRow,
} from "@devtools/db";
import { AmbiguousRunIdError, LighthouseRunNotFoundError } from "./errors";
import type { LighthouseFormFactor } from "./schemas";

/**
 * Filter and pagination options for {@link listLighthouseRuns} and {@link listLighthouseRunsWithTotal}.
 */
export interface ListLighthouseRunsOptions {
  /** Optional exact URL filter. */
  url?: string;
  /** Optional case-insensitive URL substring filter. */
  search?: string;
  /** Optional form factor filter (`"mobile"` or `"desktop"`). */
  formFactor?: LighthouseFormFactor;
  /** Maximum number of rows to return. Defaults to `50`. */
  limit?: number;
  /** Zero-based row offset for pagination. Defaults to `0`. */
  offset?: number;
}

/**
 * Lookup options for {@link findPreviousLighthouseRun}.
 */
export interface FindPreviousRunOptions {
  /** Target URL to match. */
  url: string;
  /** Form factor (`"mobile"` or `"desktop"`) to match. */
  formFactor: LighthouseFormFactor;
  /** Optional current run ID to exclude so the immediately preceding run is returned. */
  excludeId?: string;
}

/**
 * Inserts a new canonical Lighthouse run row into `lighthouse_runs` and returns the persisted record.
 *
 * @param db - Target {@link DevtoolsDb} instance.
 * @param row - Insert payload for `lighthouse_runs`.
 * @returns The persisted {@link LighthouseRunRow}.
 */
export function insertLighthouseRun(
  db: DevtoolsDb,
  row: NewLighthouseRunRow,
): LighthouseRunRow {
  return db.insert(lighthouseRuns).values(row).returning().get();
}

/**
 * Retrieves a single Lighthouse run record by its primary key `id`, or `null` if not found.
 *
 * @param db - Target {@link DevtoolsDb} instance.
 * @param id - Run identifier to look up.
 * @returns Matching {@link LighthouseRunRow} or `null`.
 */
export function getLighthouseRunById(
  db: DevtoolsDb,
  id: string,
): LighthouseRunRow | null {
  const row = db
    .select()
    .from(lighthouseRuns)
    .where(eq(lighthouseRuns.id, id))
    .get();
  return row ?? null;
}

function escapeLikePattern(value: string): string {
  return value
    .replaceAll("/", "//")
    .replaceAll("%", "/%")
    .replaceAll("_", "/_");
}

function buildListRunsCondition(
  options: Pick<ListLighthouseRunsOptions, "url" | "search" | "formFactor">,
) {
  const conditions = [];
  if (options.url) {
    conditions.push(eq(lighthouseRuns.url, options.url));
  }
  if (options.search) {
    const escaped = escapeLikePattern(options.search.toLowerCase());
    conditions.push(
      sql`LOWER(${lighthouseRuns.url}) LIKE ${`%${escaped}%`} ESCAPE '/'`,
    );
  }
  if (options.formFactor) {
    conditions.push(eq(lighthouseRuns.formFactor, options.formFactor));
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Lists Lighthouse run records ordered by `createdAt` descending with optional URL,
 * substring search, form factor, limit, and offset filters.
 *
 * @param db - Target {@link DevtoolsDb} instance.
 * @param options - Optional filter and pagination criteria.
 * @returns Array of matching {@link LighthouseRunRow} records.
 */
export function listLighthouseRuns(
  db: DevtoolsDb,
  options: ListLighthouseRunsOptions = {},
): LighthouseRunRow[] {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  return db
    .select()
    .from(lighthouseRuns)
    .where(buildListRunsCondition(options))
    .orderBy(desc(lighthouseRuns.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
}

/**
 * Counts historical Lighthouse run records matching the given filter criteria.
 *
 * @param db - Target {@link DevtoolsDb} instance.
 * @param options - Optional URL, substring search, and form factor filters.
 * @returns Total matching row count.
 */
export function countLighthouseRuns(
  db: DevtoolsDb,
  options: Pick<
    ListLighthouseRunsOptions,
    "url" | "search" | "formFactor"
  > = {},
): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lighthouseRuns)
    .where(buildListRunsCondition(options))
    .get();
  return Number(result?.count ?? 0);
}

/**
 * Lists paginated Lighthouse run records alongside the total matching row count.
 *
 * @param db - Target {@link DevtoolsDb} instance.
 * @param options - Filter and pagination criteria.
 * @returns Paginated `runs` slice and unpaginated `total` count.
 */
export function listLighthouseRunsWithTotal(
  db: DevtoolsDb,
  options: ListLighthouseRunsOptions = {},
): { runs: LighthouseRunRow[]; total: number } {
  return {
    runs: listLighthouseRuns(db, options),
    total: countLighthouseRuns(db, options),
  };
}

/**
 * Finds the most recent previous Lighthouse run for the same `url` and `formFactor`,
 * optionally excluding a specific run ID (such as the newly inserted run).
 *
 * @param db - Target {@link DevtoolsDb} instance.
 * @param options - URL, formFactor, and optional `excludeId` criteria.
 * @returns Most recent matching {@link LighthouseRunRow}, or `null` when none exists.
 */
export function findPreviousLighthouseRun(
  db: DevtoolsDb,
  options: FindPreviousRunOptions,
): LighthouseRunRow | null {
  const conditions = [
    eq(lighthouseRuns.url, options.url),
    eq(lighthouseRuns.formFactor, options.formFactor),
  ];
  if (options.excludeId) {
    conditions.push(ne(lighthouseRuns.id, options.excludeId));
  }

  const row = db
    .select()
    .from(lighthouseRuns)
    .where(and(...conditions))
    .orderBy(desc(lighthouseRuns.createdAt))
    .limit(1)
    .get();
  return row ?? null;
}

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
export function resolveLighthouseRun(
  db: DevtoolsDb,
  idOrPrefix: string,
): LighthouseRunRow {
  const query = idOrPrefix.trim();

  const exact = getLighthouseRunById(db, query);
  if (exact) {
    return exact;
  }

  if (query.length < MIN_PREFIX_LENGTH) {
    throw new LighthouseRunNotFoundError(
      `Run ID prefix "${query}" is too short. Minimum ${MIN_PREFIX_LENGTH} characters required for prefix lookup.`,
    );
  }

  const escaped = escapeLikePattern(query);

  const matches = db
    .select()
    .from(lighthouseRuns)
    .where(sql`${lighthouseRuns.id} LIKE ${escaped + "%"} ESCAPE '/'`)
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
export function getLatestLighthouseRun(db: DevtoolsDb): LighthouseRunRow {
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
