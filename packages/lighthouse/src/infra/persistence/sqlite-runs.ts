import {
  and,
  asc,
  desc,
  eq,
  gte,
  lighthouseRuns,
  lt,
  ne,
  sql,
  type DevtoolsDb,
  type LighthouseRunRow,
} from "@devtools/db";
import {
  AmbiguousRunIdError,
  LighthouseRunNotFoundError,
  type FindPreviousRunOptions,
  type LighthouseRunListRecord,
  type LighthouseRunRecord,
  type ListLighthouseRunsOptions,
  type NewLighthouseRunRecord,
} from "../../contracts";
import { parseRunSummary } from "../../domain";

/**
 * Minimum character length permitted for short-UUID prefix lookups.
 */
export const MIN_PREFIX_LENGTH = 6;

const LIST_RUN_COLUMNS = {
  id: lighthouseRuns.id,
  url: lighthouseRuns.url,
  finalUrl: lighthouseRuns.finalUrl,
  formFactor: lighthouseRuns.formFactor,
  throttlingMethod: lighthouseRuns.throttlingMethod,
  performanceScore: lighthouseRuns.performanceScore,
  accessibilityScore: lighthouseRuns.accessibilityScore,
  bestPracticesScore: lighthouseRuns.bestPracticesScore,
  seoScore: lighthouseRuns.seoScore,
  lcpMs: lighthouseRuns.lcpMs,
  cls: lighthouseRuns.cls,
  tbtMs: lighthouseRuns.tbtMs,
  fcpMs: lighthouseRuns.fcpMs,
  siMs: lighthouseRuns.siMs,
  ttfbMs: lighthouseRuns.ttfbMs,
  jsonReportPath: lighthouseRuns.jsonReportPath,
  htmlReportPath: lighthouseRuns.htmlReportPath,
  durationMs: lighthouseRuns.durationMs,
  createdAt: lighthouseRuns.createdAt,
};

function toLighthouseRunRecord(row: LighthouseRunRow): LighthouseRunRecord {
  return {
    ...row,
    summaryJson: parseRunSummary(row.summaryJson),
  };
}

function computePrefixUpperBound(prefix: string): string | null {
  const chars = Array.from(prefix);
  for (let idx = chars.length - 1; idx >= 0; idx -= 1) {
    const rawCode = chars[idx]?.codePointAt(0);
    if (rawCode !== undefined) {
      const code = rawCode >= 0xd800 && rawCode <= 0xdfff ? 0xfffd : rawCode;
      if (code < 0x10ffff) {
        const nextCode = code === 0xd7ff ? 0xe000 : code + 1;
        return chars.slice(0, idx).join("") + String.fromCodePoint(nextCode);
      }
    }
  }
  return null;
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
 * Inserts a new canonical Lighthouse run row into `lighthouse_runs` and returns the persisted record.
 */
export function insertLighthouseRun(
  db: DevtoolsDb,
  row: NewLighthouseRunRecord,
): LighthouseRunRecord {
  return toLighthouseRunRecord(
    db.insert(lighthouseRuns).values(row).returning().get(),
  );
}

/**
 * Retrieves a single Lighthouse run record by its primary key `id`, or `null` if not found.
 */
function getLighthouseRunById(
  db: DevtoolsDb,
  id: string,
): LighthouseRunRecord | null {
  const row = db
    .select()
    .from(lighthouseRuns)
    .where(eq(lighthouseRuns.id, id))
    .get();
  return row ? toLighthouseRunRecord(row) : null;
}

/**
 * Lists lightweight Lighthouse run records ordered by `createdAt` descending with optional filters
 * (omits the heavy `summaryJson` column).
 */
export function listLighthouseRuns(
  db: DevtoolsDb,
  options: ListLighthouseRunsOptions = {},
): LighthouseRunListRecord[] {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  return db
    .select(LIST_RUN_COLUMNS)
    .from(lighthouseRuns)
    .where(buildListRunsCondition(options))
    .orderBy(desc(lighthouseRuns.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
}

/**
 * Counts historical Lighthouse run records matching the given filter criteria.
 */
function countLighthouseRuns(
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
  return result?.count ?? 0;
}

/**
 * Lists paginated Lighthouse run records alongside the total matching row count
 * inside a single deferred SQLite snapshot transaction.
 */
export function listLighthouseRunsWithTotal(
  db: DevtoolsDb,
  options: ListLighthouseRunsOptions = {},
): { runs: LighthouseRunListRecord[]; total: number } {
  return db.transaction(
    (tx) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Drizzle SQLiteTransaction exposes the full DevtoolsDb query surface inside transactions.
      const txDb = tx as unknown as DevtoolsDb;
      return {
        runs: listLighthouseRuns(txDb, options),
        total: countLighthouseRuns(txDb, options),
      };
    },
    { behavior: "deferred" },
  );
}

/**
 * Finds the most recent previous Lighthouse run for the same `url` and `formFactor`,
 * optionally excluding a specific run ID.
 */
export function findPreviousLighthouseRun(
  db: DevtoolsDb,
  options: FindPreviousRunOptions,
): LighthouseRunRecord | null {
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
  return row ? toLighthouseRunRecord(row) : null;
}

/**
 * Resolves a Lighthouse run by full UUID or unique short-ID prefix against SQLite.
 */
export function resolveLighthouseRun(
  db: DevtoolsDb,
  idOrPrefix: string,
): LighthouseRunRecord {
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

  const prefix = /^[0-9a-fA-F-]+$/.test(query) ? query.toLowerCase() : query;
  const upperBound = computePrefixUpperBound(prefix);

  const matches = db
    .select()
    .from(lighthouseRuns)
    .where(
      upperBound !== null
        ? and(gte(lighthouseRuns.id, prefix), lt(lighthouseRuns.id, upperBound))
        : gte(lighthouseRuns.id, prefix),
    )
    .orderBy(asc(lighthouseRuns.id))
    .limit(6)
    .all();

  if (matches.length > 1) {
    const candidateIds = matches.map((m) => m.id).join(", ");
    throw new AmbiguousRunIdError(
      `Ambiguous run ID prefix "${query}". Matches multiple runs: [${candidateIds}]. Specify more characters to disambiguate.`,
    );
  }

  const [match] = matches;
  if (!match) {
    throw new LighthouseRunNotFoundError(`Audit run "${query}" not found.`);
  }

  return toLighthouseRunRecord(match);
}

/**
 * Resolves the single most recent Lighthouse audit run recorded in SQLite.
 */
export function getLatestLighthouseRun(db: DevtoolsDb): LighthouseRunRecord {
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

  return toLighthouseRunRecord(row);
}
