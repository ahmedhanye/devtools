import { EmptyRunsError } from "./errors";
import type {
  LighthouseMedianMetadata,
  RawLighthouseResult,
  SingleIterationResult,
} from "./types";

/**
 * Result returned by {@link computeRepresentativeRun}.
 */
export interface RepresentativeRunSelection {
  /** The single actual run closest to the batch median FCP and median Interactive/TBT. */
  representative: SingleIterationResult;
  /** Zero-based index of the selected Representative Run within the input batch. */
  runIndex: number;
  /** Distribution metadata when `runs.length > 1`, or `null` when `runs.length === 1`. */
  medianMetadata: LighthouseMedianMetadata | null;
}

/**
 * Extracts `first-contentful-paint` numericValue in milliseconds from an LHR, defaulting to `0`.
 */
function getFcpMs(lhr: RawLighthouseResult): number {
  const val = lhr.audits?.["first-contentful-paint"]?.numericValue;
  return typeof val === "number" && Number.isFinite(val) ? val : 0;
}

/**
 * Extracts `interactive` (TTI) numericValue in milliseconds from an LHR, falling back to
 * `total-blocking-time` (or `0`) when `interactive` is missing or `0`.
 */
function getInteractiveOrTbtMs(lhr: RawLighthouseResult): number {
  const interactive = lhr.audits?.interactive?.numericValue;
  if (
    typeof interactive === "number" &&
    Number.isFinite(interactive) &&
    interactive > 0
  ) {
    return interactive;
  }
  const tbt = lhr.audits?.["total-blocking-time"]?.numericValue;
  return typeof tbt === "number" && Number.isFinite(tbt) ? tbt : 0;
}

/**
 * Computes the middle element (`Math.floor(values.length / 2)`) of a sorted numeric copy,
 * matching `@lhci/utils` `computeRepresentativeRuns` median element selection.
 */
function pickMiddleValue(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Selects a single Representative Run from a batch of Lighthouse iterations.
 *
 * @remarks
 * Uses minimum squared Euclidean distance to the batch median First Contentful Paint (`first-contentful-paint`)
 * and median Interactive (`interactive`, falling back to `total-blocking-time` when `0` or absent):
 *
 * $$D(\text{run}) = (\text{FCP}_{\text{run}} - \text{medianFcp})^2 + (\text{TTI}_{\text{run}} - \text{medianInteractive})^2$$
 *
 * @param runs - Non-empty array of single-iteration Lighthouse results.
 * @returns The selected Representative Run, its zero-based index, and multi-run distribution metadata.
 * @throws {@link EmptyRunsError} When `runs` is empty.
 */
export function computeRepresentativeRun(
  runs: readonly SingleIterationResult[],
): RepresentativeRunSelection {
  if (runs.length === 0) {
    throw new EmptyRunsError(
      "Cannot compute a representative run from an empty runs array",
    );
  }

  if (runs.length === 1) {
    return {
      representative: runs[0]!,
      runIndex: 0,
      medianMetadata: null,
    };
  }

  const fcpValues = runs.map((r) => getFcpMs(r.lhr));
  const interactiveValues = runs.map((r) => getInteractiveOrTbtMs(r.lhr));

  const medianFcpMs = pickMiddleValue(fcpValues);
  const medianInteractiveMs = pickMiddleValue(interactiveValues);

  const runDistances = runs.map((_, idx) => {
    const fcpMs = fcpValues[idx]!;
    const interactiveMs = interactiveValues[idx]!;
    const distanceSquared =
      (fcpMs - medianFcpMs) ** 2 + (interactiveMs - medianInteractiveMs) ** 2;
    return {
      runIndex: idx,
      fcpMs,
      interactiveMs,
      distanceSquared,
    };
  });

  const sortedByDistance = runDistances.toSorted(
    (a, b) => a.distanceSquared - b.distanceSquared || a.runIndex - b.runIndex,
  );
  const best = sortedByDistance[0]!;

  return {
    representative: runs[best.runIndex]!,
    runIndex: best.runIndex,
    medianMetadata: {
      totalRuns: runs.length,
      selectedRunIndex: best.runIndex,
      medianFcpMs,
      medianInteractiveMs,
      runDistances,
    },
  };
}
