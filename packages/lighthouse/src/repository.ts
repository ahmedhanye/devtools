import {
  and,
  desc,
  eq,
  lighthouseRuns,
  ne,
  type DevtoolsDb,
  type LighthouseRunRow,
  type NewLighthouseRunRow,
} from "@devtools/db";
import type { LighthouseFormFactor } from "./types";

/**
 * Filter and pagination options for {@link listLighthouseRuns}.
 */
export interface ListLighthouseRunsOptions {
  /** Optional exact URL filter. */
  url?: string;
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

/**
 * Lists Lighthouse run records ordered by `createdAt` descending with optional URL,
 * form factor, limit, and offset filters.
 *
 * @param db - Target {@link DevtoolsDb} instance.
 * @param options - Optional filter and pagination criteria.
 * @returns Array of matching {@link LighthouseRunRow} records.
 */
export function listLighthouseRuns(
  db: DevtoolsDb,
  options: ListLighthouseRunsOptions = {},
): LighthouseRunRow[] {
  const conditions = [];
  if (options.url) {
    conditions.push(eq(lighthouseRuns.url, options.url));
  }
  if (options.formFactor) {
    conditions.push(eq(lighthouseRuns.formFactor, options.formFactor));
  }

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  return db
    .select()
    .from(lighthouseRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(lighthouseRuns.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
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
