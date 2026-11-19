#!/usr/bin/env bun
/**
 * Deterministic workspace CLI for the teach skill.
 * Manages topic tracks in `.scratch/teach/tracks.json` and validates lesson files.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

/** Track metadata stored inside `.scratch/teach/tracks.json`. */
export interface TrackEntry {
  /** Human-readable title of the learning track. */
  title: string;
  /** Canonical kebab-case track identifier. */
  slug: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Relative path to this track's MISSION.md file. */
  missionFile: string;
  /** Number of lessons where the user demonstrated completion. */
  completedLessons: number;
  /** Lesson number currently active or next in sequence. */
  currentLesson: number;
}

/** Root `.scratch/teach/tracks.json` registry schema. */
export interface TracksRegistry {
  /** Slug of the currently active track, or null when unset. */
  activeTrack: string | null;
  /** Map of track slugs to track metadata entries. */
  tracks: Record<string, TrackEntry>;
}

/** Presence and emptiness state of a track markdown file. */
export interface TrackFileState {
  /** Absolute filesystem path. */
  path: string;
  /** Clickable `file://` URI. */
  uri: string;
  /** Whether the file exists on disk. */
  exists: boolean;
  /** Whether the file exists and has non-whitespace content. */
  nonEmpty: boolean;
}

/** Reconciled on-disk and registry summary for one topic track. */
export interface TrackSummary {
  /** Canonical kebab-case track identifier. */
  slug: string;
  /** Track title from registry or derived from slug. */
  title: string;
  /** Whether this track is `activeTrack` in `tracks.json`. */
  active: boolean;
  /** Whether the track has an entry in `tracks.json`. */
  registered: boolean;
  /** Absolute path to `<root>/<slug>`. */
  trackDir: string;
  /** Completed lesson count tracked in `tracks.json`. */
  completedLessons: number;
  /** Current lesson number tracked in `tracks.json`. */
  currentLesson: number;
  /** Highest 4-digit lesson number found in `lessons/`, or `0` if none. */
  highestLessonNumber: number;
  /** Highest 4-digit record number found in `learning-records/`, or `0` if none. */
  highestRecordNumber: number;
  /** Next sequential 4-digit lesson number (`0001`, `0002`, ...). */
  nextLessonNumber: string;
  /** Next sequential 4-digit learning-record number (`0001`, `0002`, ...). */
  nextRecordNumber: string;
  /** Uncompleted latest lesson number on disk, or `null` when caught up. */
  pendingLesson: number | null;
  /** Core track file states. */
  files: {
    mission: TrackFileState;
    notes: TrackFileState;
    resources: TrackFileState;
    glossary: TrackFileState;
  };
  /** Sorted lesson file entries. */
  lessons: Array<{ number: number; name: string; path: string; uri: string }>;
  /** Sorted learning-record file names. */
  learningRecords: string[];
  /** Sorted reference file names. */
  referenceFiles: string[];
}

/** Result returned by {@link getStatus}. */
export interface StatusResult {
  /** Absolute path to the teach workspace root. */
  rootDir: string;
  /** Absolute path to `tracks.json`. */
  tracksJsonPath: string;
  /** Active track slug, if set. */
  activeTrack: string | null;
  /** Requested topic lookup details when a query was passed. */
  requested: {
    query: string;
    slug: string;
    exists: boolean;
    fuzzyMatches: string[];
  } | null;
  /** All discovered or registered tracks. */
  tracks: TrackSummary[];
  /** Resolved target track when unambiguous, else `null`. */
  resolved: TrackSummary | null;
}

/** Line-located validation error produced by {@link validateLesson}. */
export interface ValidationIssue {
  /** 1-based line number, when localized. */
  line?: number;
  /** Actionable description of the validation failure. */
  message: string;
}

/** Result returned by {@link validateLesson}. */
export interface ValidateResult {
  /** Whether all structural, drill, link, and Mermaid checks passed. */
  valid: boolean;
  /** Absolute path to the validated lesson file. */
  absPath: string;
  /** Clickable `file://` URI for the lesson file. */
  uri: string;
  /** Workspace-relative path string expected in `**Workspace File**`. */
  workspaceFile: string;
  /** Track slug inferred from the parent directory. */
  slug: string;
  /** Parsed 4-digit lesson number, or `null` if filename was malformed. */
  lessonNumber: number | null;
  /** Number of drill questions found. */
  questionCount: number;
  /** Ordered correct answer letters across drill questions. */
  answers: string[];
  /** Validation issues found (empty when `valid` is `true`). */
  issues: ValidationIssue[];
}

const ALLOWED_MERMAID_HEADERS = [
  "flowchart TD",
  "flowchart LR",
  "sequenceDiagram",
  "stateDiagram-v2",
  "classDiagram",
] as const;

const REQUIRED_SECTIONS = [
  "problem statement",
  "core concepts",
  "interactive retrieval drill",
  "primary sources",
] as const;

/**
 * Converts a topic string into a canonical kebab-case slug.
 *
 * @param input - Topic name or raw slug.
 * @returns Normalized kebab-case identifier.
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Formats a positive integer as a zero-padded 4-digit string.
 *
 * @param num - Non-negative integer to pad.
 * @returns Zero-padded string such as `"0001"`.
 */
export function pad4(num: number): string {
  return String(num).padStart(4, "0");
}

/**
 * Converts a filesystem path into a clickable `file://` URI.
 *
 * @param absPath - Absolute filesystem path.
 * @returns `file://` URI string.
 */
export function toFileUri(absPath: string): string {
  return `file://${absPath.replace(/\\/g, "/")}`;
}

/**
 * Resolves the workspace root directory containing `.scratch/teach` (git root if available, else `cwd`).
 *
 * @param cwd - Working directory used for repository lookup. Defaults to `process.cwd()`.
 * @returns Absolute path to the repository or working root.
 */
export function resolveRepoRoot(cwd: string = process.cwd()): string {
  const probe = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  if (probe.status === 0 && probe.stdout.trim()) {
    return probe.stdout.trim();
  }
  return resolve(cwd);
}

/**
 * Resolves the teach workspace directory from an explicit `--root` override or the default `.scratch/teach`.
 *
 * @param explicitRoot - Optional `--root` directory override.
 * @param cwd - Working directory for default resolution.
 * @returns Absolute path to the teach workspace root.
 */
export function resolveTeachRoot(
  explicitRoot?: string,
  cwd: string = process.cwd(),
): string {
  if (explicitRoot) {
    return resolve(cwd, explicitRoot);
  }
  return join(resolveRepoRoot(cwd), ".scratch", "teach");
}

/**
 * Reads and parses `tracks.json` from `rootDir`, returning an empty registry if the file does not exist.
 *
 * @param rootDir - Teach workspace root directory.
 * @returns Parsed {@link TracksRegistry}.
 * @throws {Error} When `tracks.json` exists but contains invalid JSON or a non-object root.
 */
export function readTracksRegistry(rootDir: string): TracksRegistry {
  const tracksJsonPath = join(rootDir, "tracks.json");
  if (!existsSync(tracksJsonPath)) {
    return { activeTrack: null, tracks: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(tracksJsonPath, "utf8"));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Invalid JSON in ${tracksJsonPath}: ${msg}. Repair tracks.json before running track commands.`,
      { cause: err },
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Malformed ${tracksJsonPath}: expected a top-level JSON object.`,
    );
  }

  const raw = parsed as Record<string, unknown>;
  const activeTrack =
    typeof raw.activeTrack === "string" && raw.activeTrack.trim()
      ? raw.activeTrack
      : null;

  const tracks: Record<string, TrackEntry> = {};
  if (
    typeof raw.tracks === "object" &&
    raw.tracks !== null &&
    !Array.isArray(raw.tracks)
  ) {
    for (const [key, val] of Object.entries(
      raw.tracks as Record<string, unknown>,
    )) {
      if (typeof val !== "object" || val === null || Array.isArray(val)) {
        continue;
      }
      const item = val as Record<string, unknown>;
      const slug = typeof item.slug === "string" ? item.slug : key;
      tracks[slug] = {
        title: typeof item.title === "string" ? item.title : slug,
        slug,
        createdAt:
          typeof item.createdAt === "string"
            ? item.createdAt
            : new Date().toISOString(),
        missionFile:
          typeof item.missionFile === "string"
            ? item.missionFile
            : `.scratch/teach/${slug}/MISSION.md`,
        completedLessons:
          typeof item.completedLessons === "number" &&
          Number.isFinite(item.completedLessons)
            ? item.completedLessons
            : 0,
        currentLesson:
          typeof item.currentLesson === "number" &&
          Number.isFinite(item.currentLesson)
            ? item.currentLesson
            : 1,
      };
    }
  }

  return { activeTrack, tracks };
}

/**
 * Persists `tracks.json` inside `rootDir` with two-space formatting.
 *
 * @param rootDir - Teach workspace root directory.
 * @param registry - Registry state to write.
 */
export function writeTracksRegistry(
  rootDir: string,
  registry: TracksRegistry,
): void {
  mkdirSync(rootDir, { recursive: true });
  const tracksJsonPath = join(rootDir, "tracks.json");
  writeFileSync(
    tracksJsonPath,
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8",
  );
}

function inspectFileState(filePath: string): TrackFileState {
  if (!existsSync(filePath)) {
    return {
      path: filePath,
      uri: toFileUri(filePath),
      exists: false,
      nonEmpty: false,
    };
  }
  const nonEmpty = readFileSync(filePath, "utf8").trim().length > 0;
  return {
    path: filePath,
    uri: toFileUri(filePath),
    exists: true,
    nonEmpty,
  };
}

function listNumberedMarkdownFiles(dirPath: string): Array<{
  number: number;
  name: string;
  path: string;
  uri: string;
}> {
  if (!existsSync(dirPath)) {
    return [];
  }
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const results: Array<{
    number: number;
    name: string;
    path: string;
    uri: string;
  }> = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const match = entry.name.match(/^(\d{4})-/);
    if (!match?.[1]) continue;
    const filePath = join(dirPath, entry.name);
    results.push({
      number: Number.parseInt(match[1], 10),
      name: entry.name,
      path: filePath,
      uri: toFileUri(filePath),
    });
  }

  return results.toSorted(
    (a, b) => a.number - b.number || a.name.localeCompare(b.name),
  );
}

function listMarkdownNames(dirPath: string): string[] {
  if (!existsSync(dirPath)) {
    return [];
  }
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b));
}

function inspectTrackSummary(
  rootDir: string,
  slug: string,
  activeTrack: string | null,
  entry?: TrackEntry,
): TrackSummary {
  const trackDir = join(rootDir, slug);
  const lessons = listNumberedMarkdownFiles(join(trackDir, "lessons"));
  const learningRecords = listNumberedMarkdownFiles(
    join(trackDir, "learning-records"),
  );
  const referenceFiles = listMarkdownNames(join(trackDir, "reference"));

  const highestLessonNumber =
    lessons.length > 0 ? (lessons[lessons.length - 1]?.number ?? 0) : 0;
  const highestRecordNumber =
    learningRecords.length > 0
      ? (learningRecords[learningRecords.length - 1]?.number ?? 0)
      : 0;

  const completedLessons = entry?.completedLessons ?? 0;
  const currentLesson =
    entry?.currentLesson ?? Math.max(1, highestLessonNumber);
  const pendingLesson =
    highestLessonNumber > completedLessons ? highestLessonNumber : null;

  return {
    slug,
    title: entry?.title ?? slug,
    active: activeTrack === slug,
    registered: entry !== undefined,
    trackDir,
    completedLessons,
    currentLesson,
    highestLessonNumber,
    highestRecordNumber,
    nextLessonNumber: pad4(
      Math.max(highestLessonNumber, completedLessons) + 1,
    ),
    nextRecordNumber: pad4(highestRecordNumber + 1),
    pendingLesson,
    files: {
      mission: inspectFileState(join(trackDir, "MISSION.md")),
      notes: inspectFileState(join(trackDir, "NOTES.md")),
      resources: inspectFileState(join(trackDir, "RESOURCES.md")),
      glossary: inspectFileState(join(trackDir, "GLOSSARY.md")),
    },
    lessons,
    learningRecords: learningRecords.map((item) => item.name),
    referenceFiles,
  };
}

const FUZZY_STOP_WORDS = new Set([
  "about",
  "and",
  "for",
  "from",
  "how",
  "into",
  "the",
  "using",
  "why",
  "with",
]);

function meaningfulSlugTokens(slug: string): string[] {
  return slug
    .split("-")
    .filter((token) => token.length >= 3 && !FUZZY_STOP_WORDS.has(token));
}

function findFuzzyMatches(slug: string, candidateSlugs: string[]): string[] {
  if (!slug) return [];
  const queryTokens = new Set(meaningfulSlugTokens(slug));
  return candidateSlugs.filter((candidate) => {
    if (candidate === slug) return false;
    if (
      slug.length >= 3 &&
      (candidate.includes(slug) || slug.includes(candidate))
    ) {
      return true;
    }
    if (queryTokens.size === 0) return false;
    return meaningfulSlugTokens(candidate).some((token) =>
      queryTokens.has(token),
    );
  });
}

/**
 * Inspects `tracks.json` and track subdirectories under `rootDir` to resolve active state and numbering.
 *
 * @param rootDir - Teach workspace root directory.
 * @param query - Optional topic name or slug to look up.
 * @returns Reconciled {@link StatusResult}.
 */
export function getStatus(rootDir: string, query?: string): StatusResult {
  const registry = readTracksRegistry(rootDir);
  const slugSet = new Set<string>(Object.keys(registry.tracks));

  if (existsSync(rootDir)) {
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        slugSet.add(entry.name);
      }
    }
  }

  const allSlugs = [...slugSet].toSorted((a, b) => a.localeCompare(b));
  const tracks = allSlugs.map((slug) =>
    inspectTrackSummary(
      rootDir,
      slug,
      registry.activeTrack,
      registry.tracks[slug],
    ),
  );

  let requested: StatusResult["requested"] = null;
  let resolved: TrackSummary | null = null;

  if (query && query.trim()) {
    const reqSlug = slugify(query);
    const match = tracks.find((t) => t.slug === reqSlug) ?? null;
    requested = {
      query: query.trim(),
      slug: reqSlug,
      exists: match !== null,
      fuzzyMatches: match ? [] : findFuzzyMatches(reqSlug, allSlugs),
    };
    resolved = match;
  } else if (registry.activeTrack) {
    resolved = tracks.find((t) => t.slug === registry.activeTrack) ?? null;
  } else if (tracks.length === 1) {
    resolved = tracks[0] ?? null;
  }

  return {
    rootDir,
    tracksJsonPath: join(rootDir, "tracks.json"),
    activeTrack: registry.activeTrack,
    requested,
    tracks,
    resolved,
  };
}

function defaultTitleFromTopic(topic: string, slug: string): string {
  const trimmed = topic.trim();
  if (trimmed !== slug && /[A-Z\s]/.test(trimmed)) {
    return trimmed;
  }
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function computeMissionFilePath(rootDir: string, slug: string): string {
  const absMission = join(rootDir, slug, "MISSION.md");
  const repoRoot = resolveRepoRoot(rootDir);
  const rel = relative(repoRoot, absMission).replace(/\\/g, "/");
  if (rel && !rel.startsWith("..")) {
    return rel;
  }
  return `${slug}/MISSION.md`;
}

/**
 * Initializes a new isolated topic track directory and registers it as `activeTrack` in `tracks.json`.
 *
 * @param rootDir - Teach workspace root directory.
 * @param topic - Topic name or kebab-case slug.
 * @param title - Optional human-readable track title.
 * @returns Summary of the newly initialized track.
 * @throws {Error} When `topic` yields an empty slug or the track already exists in `tracks.json`.
 */
export function initTrack(
  rootDir: string,
  topic: string,
  title?: string,
): TrackSummary {
  const slug = slugify(topic);
  if (!slug) {
    throw new Error(
      `Cannot derive a valid kebab-case slug from "${topic}". Provide alphanumeric characters.`,
    );
  }

  const registry = readTracksRegistry(rootDir);
  if (registry.tracks[slug]) {
    throw new Error(
      `Track "${slug}" already exists in tracks.json. Run "use ${slug}" to activate it.`,
    );
  }

  const trackTitle = title?.trim() || defaultTitleFromTopic(topic, slug);
  mkdirSync(join(rootDir, slug, "lessons"), { recursive: true });

  const entry: TrackEntry = {
    title: trackTitle,
    slug,
    createdAt: new Date().toISOString(),
    missionFile: computeMissionFilePath(rootDir, slug),
    completedLessons: 0,
    currentLesson: 1,
  };

  registry.activeTrack = slug;
  registry.tracks[slug] = entry;
  writeTracksRegistry(rootDir, registry);

  return inspectTrackSummary(rootDir, slug, registry.activeTrack, entry);
}

/**
 * Switches `activeTrack` in `tracks.json` to an existing topic track.
 *
 * @param rootDir - Teach workspace root directory.
 * @param topic - Topic name or slug.
 * @returns Summary of the activated track.
 * @throws {Error} When the target track does not exist.
 */
export function useTrack(rootDir: string, topic: string): TrackSummary {
  const slug = slugify(topic);
  const registry = readTracksRegistry(rootDir);
  const trackDir = join(rootDir, slug);

  if (!registry.tracks[slug] && !existsSync(trackDir)) {
    const available = Object.keys(registry.tracks);
    const hint =
      available.length > 0
        ? `Available tracks: ${available.join(", ")}.`
        : "No tracks exist yet; run init first.";
    throw new Error(`Track "${slug}" does not exist. ${hint}`);
  }

  if (!registry.tracks[slug]) {
    registry.tracks[slug] = {
      title: defaultTitleFromTopic(topic, slug),
      slug,
      createdAt: new Date().toISOString(),
      missionFile: computeMissionFilePath(rootDir, slug),
      completedLessons: 0,
      currentLesson: 1,
    };
  }

  registry.activeTrack = slug;
  writeTracksRegistry(rootDir, registry);

  return inspectTrackSummary(
    rootDir,
    slug,
    registry.activeTrack,
    registry.tracks[slug],
  );
}

/**
 * Records completion of a lesson in `tracks.json`, advancing `completedLessons` and `currentLesson`.
 *
 * @param rootDir - Teach workspace root directory.
 * @param topic - Topic name or slug.
 * @param explicitLesson - Optional explicit lesson number completed; defaults to the current or pending lesson.
 * @returns Updated {@link TrackSummary}.
 * @throws {Error} When the track is unknown, `explicitLesson` is invalid, or no lesson exists to complete.
 */
export function completeLesson(
  rootDir: string,
  topic: string,
  explicitLesson?: number,
): TrackSummary {
  const slug = slugify(topic);
  const registry = readTracksRegistry(rootDir);
  const entry = registry.tracks[slug];
  if (!entry) {
    throw new Error(
      `Track "${slug}" is not registered in tracks.json. Run "status" or "init" first.`,
    );
  }

  const summaryBefore = inspectTrackSummary(
    rootDir,
    slug,
    registry.activeTrack,
    entry,
  );

  let lessonNum: number;
  if (explicitLesson !== undefined) {
    if (!Number.isInteger(explicitLesson) || explicitLesson < 1) {
      throw new Error(
        `Invalid lesson number "${explicitLesson}". Expected a positive integer.`,
      );
    }
    lessonNum = explicitLesson;
  } else if (summaryBefore.highestLessonNumber === 0) {
    throw new Error(
      `Track "${slug}" has no lesson files in lessons/ yet. Author a lesson or pass --lesson <N>.`,
    );
  } else {
    lessonNum = Math.min(
      Math.max(entry.currentLesson, entry.completedLessons + 1),
      summaryBefore.highestLessonNumber,
    );
  }

  entry.completedLessons = Math.max(entry.completedLessons, lessonNum);
  entry.currentLesson = Math.max(
    entry.currentLesson,
    entry.completedLessons + 1,
  );
  writeTracksRegistry(rootDir, registry);

  return inspectTrackSummary(rootDir, slug, registry.activeTrack, entry);
}

interface ParsedFenceBlock {
  lang: string;
  startLine: number;
  lines: Array<{ lineNumber: number; text: string }>;
}

function scanFencesAndBlocks(lines: string[]): {
  fenceMask: boolean[];
  fences: ParsedFenceBlock[];
  unclosedFenceLine: number | null;
} {
  const fenceMask: boolean[] = Array.from({ length: lines.length }, () => false);
  const fences: ParsedFenceBlock[] = [];
  let openMarker = "";
  let currentBlock: ParsedFenceBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (match?.[2]) {
      const marker = match[2];
      const info = (match[3] ?? "").trim();
      if (!openMarker) {
        openMarker = marker;
        fenceMask[i] = true;
        currentBlock = {
          lang: info.split(/\s+/)[0]?.toLowerCase() ?? "",
          startLine: i + 1,
          lines: [],
        };
        continue;
      }
      if (
        marker.length >= openMarker.length &&
        marker[0] === openMarker[0] &&
        info === ""
      ) {
        fenceMask[i] = true;
        if (currentBlock) {
          fences.push(currentBlock);
          currentBlock = null;
        }
        openMarker = "";
        continue;
      }
    }

    if (openMarker) {
      fenceMask[i] = true;
      currentBlock?.lines.push({ lineNumber: i + 1, text: line });
    }
  }

  return {
    fenceMask,
    fences,
    unclosedFenceLine: currentBlock ? currentBlock.startLine : null,
  };
}

function stripInlineCode(line: string): string {
  return line.replace(/`[^`]*`/g, "");
}

function stripLinkTitleAndFragment(rawTarget: string): string {
  const trimmed = rawTarget.trim();
  const withoutTitle = trimmed.split(/\s+["']/)[0]?.trim() ?? "";
  return withoutTitle.split("#")[0]?.split("?")[0] ?? "";
}

function validateMetadataBlock(
  lines: string[],
  expectedWorkspaceSuffix: string,
  issues: ValidationIssue[],
): number {
  let firstNonEmpty = 0;
  while (firstNonEmpty < lines.length && !(lines[firstNonEmpty] ?? "").trim()) {
    firstNonEmpty++;
  }

  const firstLine = lines[firstNonEmpty] ?? "";
  const titleMatch = firstLine.match(/^# Lesson (\d{4}):\s+(.+)$/);
  if (!titleMatch?.[1] || !titleMatch[2]?.trim()) {
    issues.push({
      line: firstNonEmpty + 1,
      message:
        'First line must be "# Lesson <NNNN>: <Title>" with a 4-digit lesson number and non-empty title.',
    });
  }

  let dividerIdx = -1;
  const metaLines: Array<{ lineNumber: number; text: string }> = [];
  for (let i = firstNonEmpty + 1; i < lines.length; i++) {
    const trimmed = (lines[i] ?? "").trim();
    if (!trimmed) continue;
    if (trimmed === "---") {
      dividerIdx = i;
      break;
    }
    if (trimmed.startsWith(">")) {
      metaLines.push({ lineNumber: i + 1, text: trimmed });
      continue;
    }
    break;
  }

  const metaJoined = metaLines.map((m) => m.text).join("\n");
  if (!/\*\*Eyebrow\*\*:/i.test(metaJoined)) {
    issues.push({
      line: firstNonEmpty + 2,
      message: "Header blockquote is missing '**Eyebrow**:'.",
    });
  }
  if (!/\*\*Source\*\*:/i.test(metaJoined)) {
    issues.push({
      line: firstNonEmpty + 2,
      message: "Header blockquote is missing '**Source**:'.",
    });
  }
  const wsMatch = metaJoined.match(/\*\*Workspace File\*\*:\s*`?([^`\n]+)`?/i);
  if (!wsMatch?.[1]) {
    issues.push({
      line: firstNonEmpty + 2,
      message: "Header blockquote is missing '**Workspace File**:'.",
    });
  } else {
    const recorded = wsMatch[1].trim().replace(/\\/g, "/");
    if (!recorded.endsWith(expectedWorkspaceSuffix)) {
      issues.push({
        line: metaLines[metaLines.length - 1]?.lineNumber,
        message: `Workspace File "${recorded}" must end with "${expectedWorkspaceSuffix}".`,
      });
    }
  }

  for (let i = 0; i < metaLines.length - 1; i++) {
    const ml = metaLines[i]!;
    if (!ml.text.endsWith("<br>")) {
      issues.push({
        line: ml.lineNumber,
        message: "Header metadata lines before the last line must end with '<br>'.",
      });
    }
  }

  if (dividerIdx === -1) {
    issues.push({
      line: firstNonEmpty + 2,
      message: "Missing horizontal rule ('---') directly below header metadata.",
    });
  }

  return titleMatch?.[1] ? Number.parseInt(titleMatch[1], 10) : -1;
}

function validateRequiredSections(
  lines: string[],
  fenceMask: boolean[],
  issues: ValidationIssue[],
): { drillStartLine: number; drillEndLine: number } {
  const headings: Array<{ text: string; lineIndex: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (fenceMask[i]) continue;
    const match = (lines[i] ?? "").match(/^##\s+(.+)$/);
    if (match?.[1]) {
      headings.push({ text: match[1].trim().toLowerCase(), lineIndex: i });
    }
  }

  let prevIdx = -1;
  let drillStartLine = -1;
  let drillEndLine = lines.length;

  for (const required of REQUIRED_SECTIONS) {
    const found = headings.find((h) => h.text === required);
    if (!found) {
      issues.push({
        message: `Missing required section heading "## ${required.charAt(0).toUpperCase()}${required.slice(1)}".`,
      });
      continue;
    }
    if (found.lineIndex <= prevIdx) {
      issues.push({
        line: found.lineIndex + 1,
        message: `Section "## ${found.text}" is out of order.`,
      });
    }
    prevIdx = found.lineIndex;
    if (required === "interactive retrieval drill") {
      drillStartLine = found.lineIndex;
    } else if (required === "primary sources" && drillStartLine !== -1) {
      drillEndLine = found.lineIndex;
    }
  }

  return { drillStartLine, drillEndLine };
}

function validateDrillSection(
  lines: string[],
  drillStartLine: number,
  drillEndLine: number,
  issues: ValidationIssue[],
): { questionCount: number; answers: string[] } {
  if (drillStartLine === -1) {
    return { questionCount: 0, answers: [] };
  }

  const questionStarts: number[] = [];
  for (let i = drillStartLine + 1; i < drillEndLine; i++) {
    if (/^###\s+Question\b/i.test((lines[i] ?? "").trim())) {
      questionStarts.push(i);
    }
  }

  if (questionStarts.length < 2) {
    issues.push({
      line: drillStartLine + 1,
      message: `Interactive retrieval drill must include 2 or 3 questions (found ${questionStarts.length}).`,
    });
    return { questionCount: questionStarts.length, answers: [] };
  }

  const answers: string[] = [];
  for (let idx = 0; idx < questionStarts.length; idx++) {
    const start = questionStarts[idx]!;
    const end = questionStarts[idx + 1] ?? drillEndLine;
    const blockText = lines.slice(start, end).join("\n");
    const qLine = start + 1;

    const presentLetters = new Set<string>();
    for (const optMatch of blockText.matchAll(/^[*+-]\s+\*\*([A-D])\)\*\*/gm)) {
      if (optMatch[1]) presentLetters.add(optMatch[1]);
    }

    for (const reqLetter of ["A", "B", "C"]) {
      if (!presentLetters.has(reqLetter)) {
        issues.push({
          line: qLine,
          message: `Question ${idx + 1} is missing symmetric option "* **${reqLetter})** ...".`,
        });
      }
    }

    const detailsMatch = blockText.match(/<details>[\s\S]*?<\/details>/i);
    if (!detailsMatch) {
      issues.push({
        line: qLine,
        message: `Question ${idx + 1} is missing a closed "<details>...</details>" answer block.`,
      });
      continue;
    }

    const detailsBody = detailsMatch[0];
    if (!/<summary>[\s\S]*?<\/summary>/i.test(detailsBody)) {
      issues.push({
        line: qLine,
        message: `Question ${idx + 1} answer block is missing "<summary>...</summary>".`,
      });
    }

    const ansMatch = detailsBody.match(/>\s*\*\*Correct Answer:\s*([A-D])\*\*/i);
    if (!ansMatch?.[1]) {
      issues.push({
        line: qLine,
        message: `Question ${idx + 1} answer block is missing "> **Correct Answer: <A|B|C>**".`,
      });
    } else {
      const letter = ansMatch[1].toUpperCase();
      answers.push(letter);
      if (!presentLetters.has(letter)) {
        issues.push({
          line: qLine,
          message: `Question ${idx + 1} marks Correct Answer "${letter}" which is not among its options.`,
        });
      }
    }

    if (!/>\s*\*\*Why:\*\*/i.test(detailsBody)) {
      issues.push({
        line: qLine,
        message: `Question ${idx + 1} answer block is missing "> **Why:**".`,
      });
    }
  }

  if (answers.length >= 2 && new Set(answers).size < 2) {
    issues.push({
      line: drillStartLine + 1,
      message: `All ${answers.length} drill questions use Correct Answer "${answers[0]}". Vary correct options across questions.`,
    });
  }

  return { questionCount: questionStarts.length, answers };
}

function validateMermaidBlocks(
  fences: ParsedFenceBlock[],
  issues: ValidationIssue[],
): void {
  for (const block of fences) {
    if (block.lang !== "mermaid") continue;
    const firstContent = block.lines.find((entry) => {
      const t = entry.text.trim();
      return t.length > 0 && !t.startsWith("%%");
    });

    if (!firstContent) {
      issues.push({
        line: block.startLine,
        message: "Empty Mermaid block.",
      });
      continue;
    }

    const trimmedHeader = firstContent.text.trim();
    const supported = ALLOWED_MERMAID_HEADERS.some((prefix) =>
      trimmedHeader.startsWith(prefix),
    );
    if (!supported) {
      issues.push({
        line: firstContent.lineNumber,
        message: `Unsupported Mermaid diagram type "${trimmedHeader}". Use one of: ${ALLOWED_MERMAID_HEADERS.join(", ")}.`,
      });
    }

    for (const lineEntry of block.lines) {
      const trimmed = lineEntry.text.trim();
      if (
        (trimmed.startsWith("style ") || trimmed.startsWith("classDef ")) &&
        trimmed.includes("fill:") &&
        !trimmed.includes("color:")
      ) {
        issues.push({
          line: lineEntry.lineNumber,
          message:
            "Custom Mermaid fill styles must also specify an explicit high-contrast 'color:' property.",
        });
      }
    }
  }
}

function validateLinksAndImages(
  lines: string[],
  fenceMask: boolean[],
  absLessonPath: string,
  repoRoot: string,
  issues: ValidationIssue[],
): void {
  const lessonDir = dirname(absLessonPath);

  for (let i = 0; i < lines.length; i++) {
    if (fenceMask[i]) continue;
    const cleaned = stripInlineCode(lines[i] ?? "");
    const lineNum = i + 1;

    for (const imgMatch of cleaned.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      const rawTarget = imgMatch[1]?.trim() ?? "";
      const target = stripLinkTitleAndFragment(rawTarget);
      if (
        !target ||
        target.startsWith("http://") ||
        target.startsWith("https://") ||
        target.startsWith("data:")
      ) {
        continue;
      }
      if (!isAbsolute(target)) {
        issues.push({
          line: lineNum,
          message: `Image "${target}" uses a relative path. Embed gitignored lesson assets using an absolute filesystem path.`,
        });
        continue;
      }
      if (!existsSync(target)) {
        issues.push({
          line: lineNum,
          message: `Embedded image does not exist on disk: "${target}".`,
        });
      }
    }

    for (const linkMatch of cleaned.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
      const rawTarget = linkMatch[1]?.trim() ?? "";
      const target = stripLinkTitleAndFragment(rawTarget);
      if (
        !target ||
        target.startsWith("http://") ||
        target.startsWith("https://") ||
        target.startsWith("mailto:") ||
        target.startsWith("#") ||
        target.startsWith("data:")
      ) {
        continue;
      }

      if (target.startsWith("file://")) {
        const rawPath = target.slice("file://".length);
        if (!rawPath.startsWith("/")) {
          issues.push({
            line: lineNum,
            message: `Invalid file URI "${target}". Provide an absolute filesystem path after "file://".`,
          });
          continue;
        }
        const decoded = decodeURIComponent(rawPath);
        if (!existsSync(decoded)) {
          issues.push({
            line: lineNum,
            message: `Broken file:// link points to missing path: "${decoded}".`,
          });
        }
        continue;
      }

      const resolved = target.startsWith("/")
        ? join(repoRoot, target)
        : resolve(lessonDir, target);
      if (!existsSync(resolved)) {
        issues.push({
          line: lineNum,
          message: `Broken local link "${target}" resolves to missing path "${resolved}".`,
        });
      }
    }
  }
}

/**
 * Validates a lesson Markdown file against teach skill structure, drill, link, image, and Mermaid rules.
 *
 * @param lessonPath - Path to the lesson Markdown file.
 * @param options - Optional workspace root override and `--sync` flag to update `currentLesson` in `tracks.json`.
 * @returns {@link ValidateResult} detailing pass/fail status and any localized issues.
 */
export function validateLesson(
  lessonPath: string,
  options: { rootDir?: string; sync?: boolean } = {},
): ValidateResult {
  const absPath = resolve(lessonPath);
  const fileName = basename(absPath);
  const lessonsDir = dirname(absPath);
  const trackDir = dirname(lessonsDir);
  const slug = basename(trackDir);
  const rootDir = options.rootDir ? resolve(options.rootDir) : dirname(trackDir);
  const repoRoot = resolveRepoRoot(rootDir);
  const relToRepo = relative(repoRoot, absPath).replace(/\\/g, "/");
  const workspaceFile =
    relToRepo && !relToRepo.startsWith("..")
      ? relToRepo
      : `${slug}/lessons/${fileName}`;
  const issues: ValidationIssue[] = [];

  if (!existsSync(absPath) || !statSync(absPath).isFile()) {
    issues.push({
      message: `Lesson file not found: "${absPath}".`,
    });
    return {
      valid: false,
      absPath,
      uri: toFileUri(absPath),
      workspaceFile,
      slug,
      lessonNumber: null,
      questionCount: 0,
      answers: [],
      issues,
    };
  }

  if (basename(lessonsDir) !== "lessons") {
    issues.push({
      message: `Lesson file must live under "<track>/lessons/", got "${absPath}".`,
    });
  }

  const nameMatch = fileName.match(/^(\d{4})-([a-z0-9-]+)\.md$/);
  const lessonNumber = nameMatch?.[1]
    ? Number.parseInt(nameMatch[1], 10)
    : null;
  if (lessonNumber === null) {
    issues.push({
      message: `Lesson filename "${fileName}" must follow "<NNNN>-<kebab-slug>.md" (for example, "0001-intro.md").`,
    });
  }

  const content = readFileSync(absPath, "utf8");
  const lines = content.split("\n");
  const { fenceMask, fences, unclosedFenceLine } = scanFencesAndBlocks(lines);
  if (unclosedFenceLine !== null) {
    issues.push({
      line: unclosedFenceLine,
      message: `Unclosed code fence opened at line ${unclosedFenceLine}.`,
    });
  }

  const titleNumber = validateMetadataBlock(
    lines,
    `${slug}/lessons/${fileName}`,
    issues,
  );
  if (lessonNumber !== null && titleNumber !== -1 && titleNumber !== lessonNumber) {
    issues.push({
      line: 1,
      message: `Lesson heading number (${pad4(titleNumber)}) does not match filename prefix (${pad4(lessonNumber)}).`,
    });
  }

  if (lessonNumber !== null && existsSync(lessonsDir)) {
    const existing = listNumberedMarkdownFiles(lessonsDir);
    const duplicates = existing.filter(
      (item) => item.number === lessonNumber && item.name !== fileName,
    );
    if (duplicates.length > 0) {
      issues.push({
        message: `Duplicate lesson number ${pad4(lessonNumber)} collides with "${duplicates[0]?.name}".`,
      });
    }
    const maxPrior = existing
      .filter((item) => item.number < lessonNumber)
      .reduce((max, item) => Math.max(max, item.number), 0);
    if (lessonNumber > maxPrior + 1) {
      issues.push({
        message: `Non-sequential lesson number ${pad4(lessonNumber)}: expected ${pad4(maxPrior + 1)} after highest prior lesson ${pad4(maxPrior)}.`,
      });
    }
  }

  const { drillStartLine, drillEndLine } = validateRequiredSections(
    lines,
    fenceMask,
    issues,
  );
  const { questionCount, answers } = validateDrillSection(
    lines,
    drillStartLine,
    drillEndLine,
    issues,
  );
  validateMermaidBlocks(fences, issues);
  validateLinksAndImages(lines, fenceMask, absPath, repoRoot, issues);

  const valid = issues.length === 0;
  if (valid && options.sync && lessonNumber !== null) {
    const registry = readTracksRegistry(rootDir);
    const entry = registry.tracks[slug];
    if (entry) {
      entry.currentLesson = Math.max(entry.currentLesson, lessonNumber);
      writeTracksRegistry(rootDir, registry);
    }
  }

  return {
    valid,
    absPath,
    uri: toFileUri(absPath),
    workspaceFile,
    slug,
    lessonNumber,
    questionCount,
    answers,
    issues,
  };
}

interface CliFlags {
  rootDir?: string;
  title?: string;
  lesson?: number;
  sync: boolean;
  json: boolean;
  help: boolean;
  positionals: string[];
}

function parseCliArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    sync: false,
    json: false,
    help: false,
    positionals: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--sync") {
      flags.sync = true;
    } else if (arg === "--root") {
      const next = argv[++i];
      if (!next) throw new Error("Missing value for --root.");
      flags.rootDir = next;
    } else if (arg === "--title") {
      const next = argv[++i];
      if (!next) throw new Error("Missing value for --title.");
      flags.title = next;
    } else if (arg === "--lesson") {
      const next = argv[++i];
      if (!next) throw new Error("Missing value for --lesson.");
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || String(parsed) !== next) {
        throw new Error(`Invalid --lesson integer "${next}".`);
      }
      flags.lesson = parsed;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown flag "${arg}". Run with --help for usage.`);
    } else {
      flags.positionals.push(arg);
    }
  }

  return flags;
}

function formatTrackDetails(track: TrackSummary): string[] {
  const fileLabels: Array<[string, TrackFileState, boolean]> = [
    ["MISSION.md", track.files.mission, true],
    ["NOTES.md", track.files.notes, false],
    ["RESOURCES.md", track.files.resources, false],
    ["GLOSSARY.md", track.files.glossary, false],
  ];
  const existingFiles: string[] = [];
  const missingFiles: string[] = [];
  for (const [label, state, checkEmpty] of fileLabels) {
    if (!state.exists) {
      missingFiles.push(label);
    } else if (checkEmpty) {
      existingFiles.push(`${label} (${state.nonEmpty ? "ready" : "empty"})`);
    } else {
      existingFiles.push(label);
    }
  }

  const lines = [
    `Track: ${track.slug} (${track.title})${track.active ? " [active]" : ""}`,
    `  Dir: ${track.trackDir}`,
    `  Progress: completed=${track.completedLessons}, current=${track.currentLesson}, pendingLesson=${track.pendingLesson ? pad4(track.pendingLesson) : "none"}`,
    `  Next numbers: lesson=${track.nextLessonNumber}, record=${track.nextRecordNumber}`,
    `  Existing files: ${existingFiles.join(", ") || "none"}`,
    `  Missing files: ${missingFiles.join(", ") || "none"}`,
    `  Lessons (${track.lessons.length}): ${track.lessons.map((item) => item.name).join(", ") || "none"}`,
    `  Records (${track.learningRecords.length}): ${track.learningRecords.join(", ") || "none"}`,
    `  References (${track.referenceFiles.length}): ${track.referenceFiles.join(", ") || "none"}`,
  ];
  const latestLesson = track.lessons[track.lessons.length - 1];
  if (latestLesson) {
    lines.push(
      `  Latest lesson path: ${latestLesson.path}`,
      `  Latest lesson URI: ${latestLesson.uri}`,
    );
  }
  return lines;
}

function printStatusText(status: StatusResult): void {
  const out: string[] = [
    `Teach root: ${status.rootDir}`,
    `Active track: ${status.activeTrack ?? "none"}`,
  ];

  if (status.requested) {
    const req = status.requested;
    out.push(
      `Requested: "${req.query}" -> slug="${req.slug}" (exists=${req.exists}${req.fuzzyMatches.length > 0 ? `, fuzzyMatches=${req.fuzzyMatches.join(",")}` : ""})`,
    );
  }

  if (status.tracks.length === 0) {
    out.push("Tracks: none");
  } else {
    out.push(`Tracks (${status.tracks.length}):`);
    for (const track of status.tracks) {
      out.push(
        `  - ${track.slug}${track.active ? " *" : ""}: "${track.title}" (completed=${track.completedLessons}, current=${track.currentLesson}, lessonsOnDisk=${track.highestLessonNumber})`,
      );
    }
  }

  if (status.resolved) {
    out.push("", ...formatTrackDetails(status.resolved));
  }

  console.log(out.join("\n"));
}

function printHelp(): void {
  console.log(
    [
      "Usage: track.ts <command> [args] [options]",
      "",
      "Commands:",
      "  status [topic]                 Inspect tracks.json and workspace files",
      "  init <topic> [--title <name>]  Create track directory and activate in tracks.json",
      "  use <topic>                    Set activeTrack to an existing track",
      "  complete <topic> [--lesson N]  Mark lesson completed and advance currentLesson",
      "  validate <lesson-path> [--sync] Validate lesson structure, drill, links, and Mermaid",
      "",
      "Options:",
      "  --root <dir>   Override workspace root (default: <repo>/.scratch/teach)",
      "  --json         Emit machine-readable JSON on stdout",
      "  -h, --help     Show this help message",
    ].join("\n"),
  );
}

function runCli(): void {
  const flags = parseCliArgs(process.argv.slice(2));
  if (flags.help || flags.positionals.length === 0) {
    printHelp();
    process.exit(flags.help ? 0 : 1);
  }

  const command = flags.positionals[0]!;
  const arg = flags.positionals[1];
  const rootDir = resolveTeachRoot(flags.rootDir);

  if (command === "status") {
    const result = getStatus(rootDir, arg);
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printStatusText(result);
    }
    return;
  }

  if (command === "init") {
    if (!arg) throw new Error('Missing <topic> for "init".');
    const summary = initTrack(rootDir, arg, flags.title);
    if (flags.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(
        [
          `Initialized track "${summary.slug}" (${summary.title}).`,
          `MISSION target: ${summary.files.mission.path}`,
          `MISSION URI: ${summary.files.mission.uri}`,
          ...formatTrackDetails(summary),
        ].join("\n"),
      );
    }
    return;
  }

  if (command === "use") {
    if (!arg) throw new Error('Missing <topic> for "use".');
    const summary = useTrack(rootDir, arg);
    if (flags.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(formatTrackDetails(summary).join("\n"));
    }
    return;
  }

  if (command === "complete") {
    if (!arg) throw new Error('Missing <topic> for "complete".');
    const summary = completeLesson(rootDir, arg, flags.lesson);
    if (flags.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(formatTrackDetails(summary).join("\n"));
    }
    return;
  }

  if (command === "validate") {
    if (!arg) throw new Error('Missing <lesson-path> for "validate".');
    const result = validateLesson(arg, {
      rootDir: flags.rootDir,
      sync: flags.sync,
    });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.valid) {
      console.log(
        [
          `VALID: ${result.workspaceFile}`,
          `URI: ${result.uri}`,
          `Track: ${result.slug} | Lesson: ${result.lessonNumber !== null ? pad4(result.lessonNumber) : "?"} | Questions: ${result.questionCount} (answers: ${result.answers.join(", ")})`,
        ].join("\n"),
      );
    } else {
      console.error(`INVALID: ${result.absPath}`);
      for (const issue of result.issues) {
        const loc = issue.line ? `line ${issue.line}: ` : "";
        console.error(`  - ${loc}${issue.message}`);
      }
    }
    if (!result.valid) {
      process.exit(1);
    }
    return;
  }

  throw new Error(`Unknown command "${command}". Run with --help for usage.`);
}

if (import.meta.main) {
  try {
    runCli();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}
